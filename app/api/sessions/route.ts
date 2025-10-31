import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

export async function POST(request: Request) {
  try {
    const { hostName } = (await request.json()) as { hostName?: string };
    if (!hostName || typeof hostName !== "string") {
      return NextResponse.json({ error: "hostName is required" }, { status: 400 });
    }

    const session = sessionStore.createSession(hostName.trim());

    return NextResponse.json({ session: serializeSession(session), hostSecret: session.hostSecret });
  } catch (error) {
    console.error("Failed to create session", error);
    return NextResponse.json({ error: "Could not create game session" }, { status: 500 });
  }
}

