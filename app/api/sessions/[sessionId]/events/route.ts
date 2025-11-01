import { NextRequest } from "next/server";

import { sessionStore } from "@/lib/sessionStore";
import { serializeSession } from "@/lib/sessionSerializer";

const SSE_RETRY_INTERVAL = 3000;

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const sessionId = params.sessionId;
  const searchParams = request.nextUrl.searchParams;
  const playerId = searchParams.get("playerId");
  const hostSecret = searchParams.get("hostSecret") || request.headers.get("x-session-host-secret");

  let lastUpdated = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isActive = true;

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

          // Only send update if session changed
          if (session.updatedAt > lastUpdated) {
            lastUpdated = session.updatedAt;
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

      // Initial session send
      await checkSession();

      // Poll every 500ms for changes
      const interval = setInterval(() => {
        if (isActive) {
          void checkSession();
        }
      }, 500);

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

