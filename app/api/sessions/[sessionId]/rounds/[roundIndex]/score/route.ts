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
    const { playerId, score } = (await request.json()) as {
      playerId?: string;
      score?: number;
    };

    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (typeof score !== "number" || Number.isNaN(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: "score must be between 1 and 5" }, { status: 400 });
    }

    const roundIndex = Number.parseInt(params.roundIndex, 10);
    if (Number.isNaN(roundIndex)) {
      return NextResponse.json({ error: "Invalid round index" }, { status: 400 });
    }

    const session = await sessionStore.setPlayerScore(params.sessionId, roundIndex, playerId, score);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    console.error("Failed to assign score", error);
    const message = error instanceof Error ? error.message : "Could not assign score";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
