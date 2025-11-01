import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

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
    const roundIndex = Number.parseInt(params.roundIndex, 10);
    if (Number.isNaN(roundIndex)) {
      return NextResponse.json({ error: "Invalid round index" }, { status: 400 });
    }

    const { playerIds } = (await request.json()) as { playerIds?: string[] };
    
    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json({ error: "playerIds array is required" }, { status: 400 });
    }

    const session = await sessionStore.getSession(params.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const round = session.rounds[roundIndex];
    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    // Start generating for all specified players
    const generationPromises = playerIds.map(async (playerId) => {
      // Check if player is ready
      const entry = round.entries[playerId];
      if (!entry || entry.status !== "ready") {
        return { playerId, success: false, error: "Player not ready" };
      }

      try {
        await sessionStore.setPlayerGenerating(params.sessionId, roundIndex, playerId);
        return { playerId, success: true };
      } catch (error) {
        return {
          playerId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const results = await Promise.all(generationPromises);

    const updatedSession = await sessionStore.getSession(params.sessionId);
    if (!updatedSession) {
      return NextResponse.json({ error: "Session not found after update" }, { status: 404 });
    }

    return NextResponse.json({
      session: serializeSession(updatedSession),
      results,
    });
  } catch (error) {
    console.error("Failed to batch start generation", error);
    const message = error instanceof Error ? error.message : "Could not batch start generation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

