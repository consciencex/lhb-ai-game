import { NextResponse } from "next/server";

import { generateCompositeImage } from "@/lib/gemini";
import { buildFiveStagePrompt } from "@/lib/promptBuilder";
import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";
import { ROLE_ORDER } from "@/types/session";

const HOST_SECRET_HEADER = "x-session-host-secret";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string; roundIndex: string } },
) {
  const hostSecret = request.headers.get(HOST_SECRET_HEADER) ?? "";
  if (!hostSecret || !(await sessionStore.validateHost(params.sessionId, hostSecret))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { playerId } = (await request.json()) as { playerId?: string };
    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const roundIndex = Number.parseInt(params.roundIndex, 10);
    if (Number.isNaN(roundIndex)) {
      return NextResponse.json({ error: "Invalid round index" }, { status: 400 });
    }

    const session = await sessionStore.getSession(params.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const round = session.rounds[roundIndex];
    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    const entry = round.entries[playerId];
    if (!entry) {
      return NextResponse.json({ error: "Player entry not found" }, { status: 404 });
    }

    if (entry.status !== "ready" && entry.status !== "completed") {
      return NextResponse.json({ error: "Player prompts not ready" }, { status: 400 });
    }

    if (!round.goalImageBase64) {
      return NextResponse.json({ error: "Round goal image missing" }, { status: 400 });
    }

    const apiKey = session.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured" }, { status: 400 });
    }

    await sessionStore.setPlayerGenerating(params.sessionId, roundIndex, playerId);

    const missingSection = ROLE_ORDER.find((role) => !entry.prompts[role]);
    if (missingSection) {
      throw new Error(`Prompt section "${missingSection}" is missing.`);
    }

    const finalPrompt = buildFiveStagePrompt({
      head: entry.prompts.head ?? "",
      torso: entry.prompts.torso ?? "",
      legs: entry.prompts.legs ?? "",
      pose: entry.prompts.pose ?? "",
      background: entry.prompts.background ?? "",
    });

    const image = await generateCompositeImage({
      apiKey,
      prompt: finalPrompt,
      goalImageBase64: round.goalImageBase64,
      goalImageMimeType: round.goalImageMimeType,
    });

    // Limit image size by truncating if too large (roughly ~800KB base64)
    const truncatedImage = image.length > 800_000 ? image.substring(0, 800_000) : image;

    const updated = await sessionStore.setPlayerResult(params.sessionId, roundIndex, playerId, {
      finalPrompt,
      image: truncatedImage,
    });

    return NextResponse.json({ session: updated ? serializeSession(updated) : null });
  } catch (error) {
    console.error("Failed to generate image for round", error);
    const message = error instanceof Error ? error.message : "Could not generate image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
