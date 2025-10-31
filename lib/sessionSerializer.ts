import type { Session } from "@/types/session";

export interface SerializedSession
  extends Omit<Session, "hostSecret" | "apiKey"> {
  hasApiKey: boolean;
}

export function serializeSession(session: Session): SerializedSession {
  const { hostSecret: _hostSecret, apiKey, ...rest } = session;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

