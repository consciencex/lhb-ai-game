import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

const HOST_SECRET_HEADER = "x-session-host-secret";

export async function PATCH(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const hostSecret = request.headers.get(HOST_SECRET_HEADER) ?? "";
  if (!hostSecret || !(await sessionStore.validateHost(params.sessionId, hostSecret))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { apiKey } = (await request.json()) as { apiKey?: string };
    if (!apiKey) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }

    const session = await sessionStore.updateApiKey(params.sessionId, apiKey.trim());
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    console.error("Failed to update session settings", error);
    return NextResponse.json({ error: "Could not update game settings" }, { status: 500 });
  }
}

