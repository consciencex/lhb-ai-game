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
    const { dataUrl } = (await request.json()) as { dataUrl?: string };
    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
    }

    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid data URL" }, { status: 400 });
    }

    const [, mimeType, base64] = match;
    const roundIndex = Number.parseInt(params.roundIndex, 10);
    if (Number.isNaN(roundIndex)) {
      return NextResponse.json({ error: "Invalid round index" }, { status: 400 });
    }

    const session = await sessionStore.updateRoundGoalImage(params.sessionId, roundIndex, base64, mimeType);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    console.error("Failed to upload goal image", error);
    const message = error instanceof Error ? error.message : "Could not upload goal image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
