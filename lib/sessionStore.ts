import { randomUUID } from "crypto";

const DEFAULT_API_KEY = "AIzaSyBOW8hq2tpJ-iTuNPtiRpukje3FX-yoC6s";

import { ROLE_ORDER } from "@/types/session";
import type {
  Player,
  PlayerRoundState,
  PlayerStatus,
  PromptMap,
  RoleId,
  Session,
  SessionStatus,
} from "@/types/session";

interface InternalSession extends Session {
  hostSecret: string;
}

type SessionStoreState = Map<string, InternalSession>;

const globalSessionStore = globalThis as typeof globalThis & {
  __SESSION_STORE__?: SessionStoreState;
};

const ensureStore = (): SessionStoreState => {
  if (!globalSessionStore.__SESSION_STORE__) {
    globalSessionStore.__SESSION_STORE__ = new Map<string, InternalSession>();
  }
  return globalSessionStore.__SESSION_STORE__;
};

const createEmptyPrompts = (): PromptMap =>
  ROLE_ORDER.reduce<PromptMap>((acc, role) => {
    acc[role] = null;
    return acc;
  }, {} as PromptMap);

const cloneSession = (session: InternalSession): InternalSession =>
  JSON.parse(JSON.stringify(session)) as InternalSession;

const createPlayerState = (status: PlayerStatus = "pending"): PlayerRoundState => ({
  prompts: createEmptyPrompts(),
  currentRoleIndex: 0,
  status,
  finalPrompt: undefined,
  resultImage: undefined,
  score: undefined,
  generatedAt: undefined,
  updatedAt: Date.now(),
});

const resetPlayerState = (state: PlayerRoundState, status: PlayerStatus) => {
  state.prompts = createEmptyPrompts();
  state.currentRoleIndex = 0;
  state.status = status;
  state.finalPrompt = undefined;
  state.resultImage = undefined;
  state.score = undefined;
  state.generatedAt = undefined;
  state.updatedAt = Date.now();
};

export class SessionStore {
  private store: SessionStoreState;

  constructor() {
    this.store = ensureStore();
  }

  createSession(hostName: string) {
    const id = this.generateSessionId();
    const hostSecret = randomUUID();
    const now = Date.now();

    const session: InternalSession = {
      id,
      hostSecret,
      hostName,
      createdAt: now,
      updatedAt: now,
      status: "waiting",
      apiKey: DEFAULT_API_KEY,
      goalImageBase64: undefined,
      goalImageMimeType: undefined,
      players: [],
      rounds: Array.from({ length: 4 }, (_, index) => ({
        id: randomUUID(),
        index: index + 1,
        goalImageBase64: undefined,
        goalImageMimeType: undefined,
        status: "waiting" as SessionStatus,
        entries: {},
        createdAt: now,
        updatedAt: now,
      })),
      currentRoundIndex: -1,
    } as InternalSession;

    this.store.set(id, session);
    return cloneSession(session);
  }

  getSession(id: string) {
    const session = this.store.get(id);
    if (!session) return null;
    return cloneSession(session);
  }

  private upsert(session: InternalSession) {
    session.updatedAt = Date.now();
    this.store.set(session.id, session);
  }

  private ensureRound(session: InternalSession, roundIndex: number) {
    const round = session.rounds[roundIndex];
    if (!round) {
      throw new Error(`Round ${roundIndex + 1} not found`);
    }
    return round;
  }

  joinSession(id: string, name: string) {
    const session = this.store.get(id);
    if (!session) return null;
    if (session.players.length >= 6) {
      throw new Error("Session is full (maximum 6 players).");
    }

    const player: Player = {
      id: randomUUID(),
      name,
      joinedAt: Date.now(),
      prompts: createEmptyPrompts(),
      currentRoleIndex: 0,
      status: "pending",
    } as Player;

    session.players.push(player);

    session.rounds.forEach((round) => {
      round.entries[player.id] = createPlayerState(round.status === "collecting" ? "collecting" : "pending");
      round.updatedAt = Date.now();
    });

    this.upsert(session);
    return { session: cloneSession(session), player };
  }

  updateRoundGoalImage(id: string, roundIndex: number, base64: string, mimeType: string) {
    const session = this.store.get(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    round.goalImageBase64 = base64;
    round.goalImageMimeType = mimeType;
    round.updatedAt = Date.now();

    this.upsert(session);
    return cloneSession(session);
  }

  updateApiKey(id: string, apiKey: string) {
    const session = this.store.get(id);
    if (!session) return null;
    session.apiKey = apiKey;
    this.upsert(session);
    return cloneSession(session);
  }

  startRound(id: string, roundIndex: number) {
    const session = this.store.get(id);
    if (!session) return null;

    if (roundIndex < 0 || roundIndex >= session.rounds.length) {
      throw new Error("Invalid round index");
    }

    const round = this.ensureRound(session, roundIndex);
    if (!round.goalImageBase64) {
      throw new Error("Round goal image is missing");
    }

    session.currentRoundIndex = roundIndex;
    session.status = "collecting";
    round.status = "collecting";
    round.updatedAt = Date.now();

    session.players.forEach((player) => {
      const entry = round.entries[player.id] ?? createPlayerState();
      resetPlayerState(entry, "collecting");
      round.entries[player.id] = entry;
    });

    this.upsert(session);
    return cloneSession(session);
  }

  submitPrompt(id: string, roundIndex: number, playerId: string, prompt: string) {
    const session = this.store.get(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    if (round.status !== "collecting" && round.status !== "ready") {
      throw new Error("Round is not collecting prompts at the moment.");
    }

    const entry = round.entries[playerId];
    if (!entry) {
      throw new Error("Player not found in this round");
    }

    if (entry.status !== "collecting") {
      throw new Error("Player is not currently entering prompts.");
    }

    const roleId = ROLE_ORDER[entry.currentRoleIndex];
    if (!roleId) {
      throw new Error("All prompts already collected for this player.");
    }

    entry.prompts[roleId] = prompt;
    entry.currentRoleIndex += 1;
    entry.updatedAt = Date.now();

    if (entry.currentRoleIndex >= ROLE_ORDER.length) {
      entry.status = "ready";
    }

    if (Object.values(round.entries).every((item) => item.status === "ready" || item.status === "completed")) {
      round.status = "ready";
      session.status = "ready";
    } else {
      round.status = "collecting";
      session.status = "collecting";
    }

    round.updatedAt = Date.now();
    this.upsert(session);
    return cloneSession(session);
  }

  setPlayerGenerating(id: string, roundIndex: number, playerId: string) {
    const session = this.store.get(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    const entry = round.entries[playerId];
    if (!entry) {
      throw new Error("Player not found in this round");
    }

    entry.status = "generating";
    entry.updatedAt = Date.now();
    round.status = "generating";
    round.updatedAt = Date.now();
    session.status = "generating";

    this.upsert(session);
    return cloneSession(session);
  }

  setPlayerResult(
    id: string,
    roundIndex: number,
    playerId: string,
    result: { finalPrompt: string; image: string },
  ) {
    const session = this.store.get(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    const entry = round.entries[playerId];
    if (!entry) {
      throw new Error("Player not found in this round");
    }

    entry.finalPrompt = result.finalPrompt;
    entry.resultImage = result.image;
    entry.generatedAt = Date.now();
    entry.status = "completed";
    entry.updatedAt = Date.now();

    if (Object.values(round.entries).every((item) => item.status === "completed")) {
      round.status = "completed";
      session.status = "completed";
    } else if (Object.values(round.entries).every((item) => item.status === "ready" || item.status === "completed")) {
      round.status = "ready";
      session.status = "ready";
    }

    round.updatedAt = Date.now();
    this.upsert(session);
    return cloneSession(session);
  }

  setPlayerScore(id: string, roundIndex: number, playerId: string, score: number) {
    const session = this.store.get(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    const entry = round.entries[playerId];
    if (!entry) {
      throw new Error("Player not found in this round");
    }

    entry.score = score;
    entry.updatedAt = Date.now();
    round.updatedAt = Date.now();

    this.upsert(session);
    return cloneSession(session);
  }

  advanceRound(id: string) {
    const session = this.store.get(id);
    if (!session) return null;

    if (session.currentRoundIndex < 0) {
      throw new Error("No round has started yet");
    }

    if (session.currentRoundIndex >= session.rounds.length - 1) {
      session.status = "completed";
      this.upsert(session);
      return cloneSession(session);
    }

    session.currentRoundIndex += 1;
    const round = this.ensureRound(session, session.currentRoundIndex);
    round.status = "collecting";
    round.updatedAt = Date.now();

    session.players.forEach((player) => {
      const entry = round.entries[player.id] ?? createPlayerState();
      resetPlayerState(entry, "collecting");
      round.entries[player.id] = entry;
    });

    session.status = "collecting";
    this.upsert(session);
    return cloneSession(session);
  }

  resetSession(id: string) {
    const session = this.store.get(id);
    if (!session) return null;

    session.status = "waiting";
    session.currentRoundIndex = -1;
    session.players.forEach((player) => {
      player.prompts = createEmptyPrompts();
      player.currentRoleIndex = 0;
      player.status = "pending";
      player.finalPrompt = undefined;
      player.resultImage = undefined;
      player.generatedAt = undefined;
    });

    session.rounds.forEach((round) => {
      round.status = "waiting";
      round.updatedAt = Date.now();
      Object.values(round.entries).forEach((entry) => resetPlayerState(entry, "pending"));
    });

    this.upsert(session);
    return cloneSession(session);
  }

  validateHost(id: string, hostSecret: string) {
    const session = this.store.get(id);
    if (!session) return false;
    return session.hostSecret === hostSecret;
  }

  private generateSessionId(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let id = "";
    for (let i = 0; i < 6; i += 1) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (this.store.has(id)) {
      return this.generateSessionId();
    }
    return id;
  }
}

export const sessionStore = new SessionStore();

