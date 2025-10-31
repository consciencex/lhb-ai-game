import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

const HOST_SECRET_HEADER = "x-session-host-secret";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string; roundIndex: string } },
) {
  const hostSecret = request.headers.get(HOST_SECRET_HEADER) ?? "";
  if (!hostSecret || !sessionStore.validateHost(params.sessionId, hostSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const roundIndex = Number.parseInt(params.roundIndex, 10);
    if (Number.isNaN(roundIndex)) {
      return NextResponse.json({ error: "Invalid round index" }, { status: 400 });
    }

    const session = sessionStore.startRound(params.sessionId, roundIndex);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    console.error("Failed to start round", error);
    const message = error instanceof Error ? error.message : "Could not start round";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
