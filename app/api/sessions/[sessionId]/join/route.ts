import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { playerName } = (await request.json()) as { playerName?: string };
    if (!playerName || typeof playerName !== "string") {
      return NextResponse.json({ error: "playerName is required" }, { status: 400 });
    }

    const joined = sessionStore.joinSession(params.sessionId, playerName.trim());
    if (!joined) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { session, player } = joined;
    return NextResponse.json({ session: serializeSession(session), player });
  } catch (error) {
    console.error("Failed to join session", error);
    const message = error instanceof Error ? error.message : "Could not join session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

