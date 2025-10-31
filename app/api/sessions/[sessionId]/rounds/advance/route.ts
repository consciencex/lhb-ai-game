import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

const HOST_SECRET_HEADER = "x-session-host-secret";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const hostSecret = request.headers.get(HOST_SECRET_HEADER) ?? "";
  if (!hostSecret || !(await sessionStore.validateHost(params.sessionId, hostSecret))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const session = await sessionStore.advanceRound(params.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    console.error("Failed to advance round", error);
    const message = error instanceof Error ? error.message : "Could not advance round";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
