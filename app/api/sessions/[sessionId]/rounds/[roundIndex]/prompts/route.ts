import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string; roundIndex: string } },
) {
  try {
    const { playerId, prompt } = (await request.json()) as { playerId?: string; prompt?: string };
    if (!playerId || typeof playerId !== "string" || typeof prompt !== "string") {
      return NextResponse.json({ error: "playerId and prompt are required" }, { status: 400 });
    }

    const roundIndex = Number.parseInt(params.roundIndex, 10);
    if (Number.isNaN(roundIndex)) {
      return NextResponse.json({ error: "Invalid round index" }, { status: 400 });
    }

    const updated = sessionStore.submitPrompt(params.sessionId, roundIndex, playerId, prompt.trim());
    if (!updated) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(updated) });
  } catch (error) {
    console.error("Failed to submit prompt", error);
    const message = error instanceof Error ? error.message : "Could not submit prompt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
