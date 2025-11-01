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
      let lastPromptHashes: Record<string, string> = {};

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

      // Create a hash of all prompts for all rounds to detect changes
      const hashPrompts = (session: any): Record<string, string> => {
        const hashes: Record<string, string> = {};
        session.rounds?.forEach((round: any, roundIndex: number) => {
          const roundKey = `${roundIndex}`;
          const prompts: string[] = [];
          Object.values(round.entries || {}).forEach((entry: any) => {
            if (entry.prompts) {
              Object.entries(entry.prompts).forEach(([role, prompt]: [string, any]) => {
                if (prompt) prompts.push(`${role}:${prompt}`);
              });
              // Also include status and currentRoleIndex for faster detection
              prompts.push(`status:${entry.status || ''}`);
              prompts.push(`roleIndex:${entry.currentRoleIndex || 0}`);
            }
          });
          hashes[roundKey] = prompts.join('|');
        });
        return hashes;
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
          
          // Check for prompt changes by comparing hashes
          const currentPromptHashes = hashPrompts(session);
          const promptChanged = JSON.stringify(currentPromptHashes) !== JSON.stringify(lastPromptHashes);
          
          // Send update if session changed, player count changed, or prompts changed
          if (playerCountChanged || session.updatedAt > lastUpdated || promptChanged) {
            lastUpdated = session.updatedAt;
            lastPlayerCount = currentPlayerCount;
            lastPromptHashes = currentPromptHashes;
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

      // Initial session send - set initial player count and prompt hashes
      const initialSession = await sessionStore.getSession(sessionId);
      if (initialSession) {
        lastPlayerCount = initialSession.players.length;
        lastUpdated = initialSession.updatedAt;
        lastPromptHashes = hashPrompts(initialSession);
      }
      await checkSession();

      // Poll every 50ms for faster detection (reduced from 100ms)
      const interval = setInterval(() => {
        if (isActive) {
          void checkSession();
        }
      }, 50);

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

