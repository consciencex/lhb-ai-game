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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isActive = true;
      let lastUpdated = Date.now();
      let lastPlayerCount = -1;
      // Track prompt hashes for each round to detect prompt changes instantly
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
          
          // Check for prompt changes by comparing prompt hashes
          let promptChanged = false;
          const currentPromptHashes: Record<string, string> = {};
          
          // Check all rounds for prompt changes (not just current round)
          session.rounds.forEach((round) => {
            Object.entries(round.entries).forEach(([playerId, entry]) => {
              // Create a simple hash of all prompts including status and progress
              const promptString = JSON.stringify(entry.prompts) + entry.currentRoleIndex + entry.status;
              const key = `${round.index}:${playerId}`;
              currentPromptHashes[key] = promptString;
              
              // Check if this prompt has changed
              if (lastPromptHashes[key] !== undefined && lastPromptHashes[key] !== promptString) {
                promptChanged = true;
              }
              // Also detect new entries
              if (lastPromptHashes[key] === undefined && entry.prompts && Object.values(entry.prompts).some((p) => p !== null)) {
                promptChanged = true;
              }
            });
          });
          
          // Send update if session changed, player count changed, or prompts changed
          if (playerCountChanged || promptChanged || session.updatedAt > lastUpdated) {
            lastUpdated = session.updatedAt;
            lastPlayerCount = currentPlayerCount;
            lastPromptHashes = currentPromptHashes;
            sendEvent({
              type: "session_update",
              session: serializeSession(session),
            });
          } else {
            // Update hashes even if no update sent (for next comparison)
            lastPromptHashes = currentPromptHashes;
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
        // Initialize prompt hashes
        initialSession.rounds.forEach((round) => {
          Object.entries(round.entries).forEach(([playerId, entry]) => {
            const promptString = JSON.stringify(entry.prompts) + entry.currentRoleIndex + entry.status;
            const key = `${round.index}:${playerId}`;
            lastPromptHashes[key] = promptString;
          });
        });
      }
      await checkSession();

      // Poll every 10ms for changes (ultra fast updates for prompt detection)
      const interval = setInterval(() => {
        if (isActive) {
          void checkSession();
        }
      }, 10);

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

