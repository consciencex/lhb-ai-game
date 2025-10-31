import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const session = sessionStore.getSession(params.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    console.error("Failed to get session", error);
    return NextResponse.json({ error: "Could not fetch game session" }, { status: 500 });
  }
}

