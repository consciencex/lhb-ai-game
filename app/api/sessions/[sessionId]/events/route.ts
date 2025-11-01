import { NextRequest } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const sessionId = params.sessionId;
  const searchParams = request.nextUrl.searchParams;
  const playerId = searchParams.get("playerId");
  const hostSecret = searchParams.get("hostSecret") || request.headers.get("x-session-host-secret");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isActive = true;
      let lastUpdated = Date.now();
      let lastPlayerCount = -1;

      const sendEvent = (data: object) => {
        if (!isActive) return;
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error("Failed to send SSE event", error);
        }
      };

      const sendHeartbeat = () => {
        if (!isActive) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch (error) {
          console.error("Failed to send heartbeat", error);
        }
      };

      const checkSession = async () => {
        if (!isActive) return;
        
        try {
          const session = await sessionStore.getSession(sessionId);
          
          if (!session) {
            sendEvent({ type: "session_not_found" });
            controller.close();
            isActive = false;
            return;
          }

          // Verify access
          if (hostSecret && !(await sessionStore.validateHost(sessionId, hostSecret))) {
            sendEvent({ type: "forbidden" });
            controller.close();
            isActive = false;
            return;
          }

          if (playerId && !session.players.find((p) => p.id === playerId)) {
            sendEvent({ type: "forbidden" });
            controller.close();
            isActive = false;
            return;
          }

          // Check for player count changes (instant detection for player join/leave)
          const currentPlayerCount = session.players.length;
          const playerCountChanged = lastPlayerCount !== -1 && currentPlayerCount !== lastPlayerCount;
          
          // Simple: check if session was updated (by timestamp)
          // Only send update if session changed or player count changed
          if (playerCountChanged || session.updatedAt > lastUpdated) {
            lastUpdated = session.updatedAt;
            lastPlayerCount = currentPlayerCount;
            sendEvent({
              type: "session_update",
              session: serializeSession(session),
            });
          }
        } catch (error) {
          console.error("Failed to check session", error);
          sendEvent({ type: "error", message: "Failed to fetch session" });
        }
      };

      // Initial session send - set initial player count
      const initialSession = await sessionStore.getSession(sessionId);
      if (initialSession) {
        lastPlayerCount = initialSession.players.length;
        lastUpdated = initialSession.updatedAt;
      }
      await checkSession();

      // Poll every 100ms for changes (balanced: fast enough but not too frequent)
      const interval = setInterval(() => {
        if (isActive) {
          void checkSession();
        }
      }, 100);

      // Heartbeat every 30s
      const heartbeatInterval = setInterval(() => {
        if (isActive) {
          sendHeartbeat();
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        isActive = false;
        clearInterval(interval);
        clearInterval(heartbeatInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

