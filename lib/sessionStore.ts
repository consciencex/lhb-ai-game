import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

const DEFAULT_API_KEY = "AIzaSyBOW8hq2tpJ-iTuNPtiRpukje3FX-yoC6s";
const SESSION_KEY_PREFIX = "dx-session:";
const SESSION_TTL_SECONDS = 60 * 60 * 6; // 6 hours

const hasRedisEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = hasRedisEnv ? Redis.fromEnv() : null;
const memoryStore = hasRedisEnv ? null : new Map<string, InternalSession>();

const IMAGE_CHUNK_SIZE = 900_000; // characters per chunk when storing base64 strings in redis

type ImageCache = Map<string, string>;

const globalScope = globalThis as typeof globalThis & {
  __DX_IMAGE_CACHE__?: ImageCache;
};

const imageCache: ImageCache = globalScope.__DX_IMAGE_CACHE__ ?? new Map<string, string>();
globalScope.__DX_IMAGE_CACHE__ = imageCache;

import { ROLE_ORDER } from "@/types/session";
import type {
  Player,
  PlayerRoundState,
  PlayerStatus,
  PromptMap,
  Session,
  SessionStatus,
} from "@/types/session";

interface InternalSession extends Session {
  hostSecret: string;
}

const createEmptyPrompts = (): PromptMap =>
  ROLE_ORDER.reduce<PromptMap>((acc, role) => {
    acc[role] = null;
    return acc;
  }, {} as PromptMap);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  private sessionKey(id: string) {
    return `${SESSION_KEY_PREFIX}${id}`;
  }

  private imageBaseKey(sessionId: string, roundId: string, playerId: string) {
    return `dx-image:${sessionId}:${roundId}:${playerId}`;
  }

  private async storeResultImage(sessionId: string, roundId: string, playerId: string, image?: string) {
    const baseKey = this.imageBaseKey(sessionId, roundId, playerId);
    if (!hasRedisEnv) {
      if (!image) {
        imageCache.delete(baseKey);
      } else {
        imageCache.set(baseKey, image);
      }
      return;
    }

    const client = redis!;
    const metaKey = `${baseKey}:meta`;

    if (!image) {
      const countStr = await client.get<string>(metaKey);
      const deletions: Promise<unknown>[] = [];
      if (countStr) {
        const count = Number.parseInt(countStr, 10);
        for (let index = 0; index < count; index += 1) {
          deletions.push(client.del(`${baseKey}:chunk:${index}`));
        }
      }
      deletions.push(client.del(metaKey));
      if (deletions.length > 0) {
        await Promise.all(deletions);
      }
      return;
    }

    const existingCountStr = await client.get<string>(metaKey);
    const existingCount = existingCountStr ? Number.parseInt(existingCountStr, 10) : 0;

    const chunks: string[] = [];
    for (let offset = 0; offset < image.length; offset += IMAGE_CHUNK_SIZE) {
      chunks.push(image.slice(offset, offset + IMAGE_CHUNK_SIZE));
    }

    await Promise.all([
      client.set(metaKey, String(chunks.length), { ex: SESSION_TTL_SECONDS }),
      ...chunks.map((chunk, index) =>
        client.set(`${baseKey}:chunk:${index}`, chunk, { ex: SESSION_TTL_SECONDS }),
      ),
    ]);

    if (existingCount > chunks.length) {
      const deletions: Promise<unknown>[] = [];
      for (let index = chunks.length; index < existingCount; index += 1) {
        deletions.push(client.del(`${baseKey}:chunk:${index}`));
      }
      if (deletions.length > 0) {
        await Promise.all(deletions);
      }
    }
  }

  private async retrieveResultImage(sessionId: string, roundId: string, playerId: string) {
    const baseKey = this.imageBaseKey(sessionId, roundId, playerId);
    if (!hasRedisEnv) {
      return imageCache.get(baseKey);
    }

    const client = redis!;
    const metaKey = `${baseKey}:meta`;
    const countStr = await client.get<string>(metaKey);
    if (!countStr) return undefined;

    const count = Number.parseInt(countStr, 10);
    if (!Number.isFinite(count) || count <= 0) return undefined;

    const chunkPromises: Promise<string | null>[] = [];
    for (let index = 0; index < count; index += 1) {
      chunkPromises.push(client.get<string>(`${baseKey}:chunk:${index}`));
    }

    const chunkResults = await Promise.all(chunkPromises);
    if (chunkResults.some((chunk) => chunk == null)) return undefined;

    const image = chunkResults.join("");
    if (!image) return undefined;
    return image;
  }

  private async load(id: string): Promise<InternalSession | null> {
    if (redis) {
      const session = await redis.get<InternalSession>(this.sessionKey(id));
      if (!session) return null;
      const hydrated = clone(session);
      for (const round of hydrated.rounds) {
        for (const [playerId, entry] of Object.entries(round.entries)) {
          const cached = await this.retrieveResultImage(hydrated.id, round.id, playerId);
          if (cached) {
            entry.resultImage = cached;
          }
        }
      }
      return hydrated;
    }

    const session = memoryStore?.get(id) ?? null;
    if (!session) return null;
    const hydrated = clone(session);
    for (const round of hydrated.rounds) {
      for (const [playerId, entry] of Object.entries(round.entries)) {
        const cached = await this.retrieveResultImage(hydrated.id, round.id, playerId);
        if (cached) {
          entry.resultImage = cached;
        }
      }
    }
    return hydrated;
  }

  private async save(session: InternalSession): Promise<InternalSession> {
    session.updatedAt = Date.now();
    const persistable = clone(session);
    for (const round of persistable.rounds) {
      for (const [playerId, entry] of Object.entries(round.entries)) {
        if (entry.resultImage) {
          await this.storeResultImage(session.id, round.id, playerId, entry.resultImage);
        }
        entry.resultImage = undefined;
      }
    }
    if (redis) {
      await redis.set(this.sessionKey(session.id), persistable, { ex: SESSION_TTL_SECONDS });
    } else {
      memoryStore?.set(session.id, persistable);
    }
    return clone(session);
  }

  private ensureRound(session: InternalSession, roundIndex: number) {
    const round = session.rounds[roundIndex];
    if (!round) {
      throw new Error(`Round ${roundIndex + 1} not found`);
    }
    return round;
  }

  async createSession(hostName: string) {
    const id = await this.generateSessionId();
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
    };

    return this.save(session);
  }

  async getSession(id: string) {
    return this.load(id);
  }

  async joinSession(id: string, name: string) {
    const session = await this.load(id);
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

    const saved = await this.save(session);
    return { session: saved, player };
  }

  async updateRoundGoalImage(id: string, roundIndex: number, base64: string, mimeType: string) {
    const session = await this.load(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    round.goalImageBase64 = base64;
    round.goalImageMimeType = mimeType;
    round.updatedAt = Date.now();

    return this.save(session);
  }

  async updateApiKey(id: string, apiKey: string) {
    const session = await this.load(id);
    if (!session) return null;
    session.apiKey = apiKey;
    return this.save(session);
  }

  async startRound(id: string, roundIndex: number) {
    const session = await this.load(id);
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

    for (const player of session.players) {
      const entry = round.entries[player.id] ?? createPlayerState();
      resetPlayerState(entry, "collecting");
      round.entries[player.id] = entry;
      await this.storeResultImage(session.id, round.id, player.id, undefined);
    }

    return this.save(session);
  }

  async submitPrompt(id: string, roundIndex: number, playerId: string, prompt: string) {
    const session = await this.load(id);
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
    return this.save(session);
  }

  async setPlayerGenerating(id: string, roundIndex: number, playerId: string) {
    const session = await this.load(id);
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

    return this.save(session);
  }

  async setPlayerResult(
    id: string,
    roundIndex: number,
    playerId: string,
    result: { finalPrompt: string; image: string },
  ) {
    const session = await this.load(id);
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
    await this.storeResultImage(session.id, round.id, playerId, result.image);

    if (Object.values(round.entries).every((item) => item.status === "completed")) {
      round.status = "completed";
      session.status = "completed";
    } else if (Object.values(round.entries).every((item) => item.status === "ready" || item.status === "completed")) {
      round.status = "ready";
      session.status = "ready";
    }

    round.updatedAt = Date.now();
    return this.save(session);
  }

  async setPlayerScore(id: string, roundIndex: number, playerId: string, score: number) {
    const session = await this.load(id);
    if (!session) return null;

    const round = this.ensureRound(session, roundIndex);
    const entry = round.entries[playerId];
    if (!entry) {
      throw new Error("Player not found in this round");
    }

    entry.score = score;
    entry.updatedAt = Date.now();
    round.updatedAt = Date.now();

    return this.save(session);
  }

  async advanceRound(id: string) {
    const session = await this.load(id);
    if (!session) return null;

    if (session.currentRoundIndex < 0) {
      throw new Error("No round has started yet");
    }

    if (session.currentRoundIndex >= session.rounds.length - 1) {
      session.status = "completed";
      return this.save(session);
    }

    session.currentRoundIndex += 1;
    const round = this.ensureRound(session, session.currentRoundIndex);
    round.status = "collecting";
    round.updatedAt = Date.now();

    for (const player of session.players) {
      const entry = round.entries[player.id] ?? createPlayerState();
      resetPlayerState(entry, "collecting");
      round.entries[player.id] = entry;
      await this.storeResultImage(session.id, round.id, player.id, undefined);
    }

    session.status = "collecting";
    return this.save(session);
  }

  async resetSession(id: string) {
    const session = await this.load(id);
    if (!session) return null;

    session.status = "waiting";
    session.currentRoundIndex = -1;
    for (const player of session.players) {
      player.prompts = createEmptyPrompts();
      player.currentRoleIndex = 0;
      player.status = "pending";
      player.finalPrompt = undefined;
      player.resultImage = undefined;
      player.generatedAt = undefined;
    }

    for (const round of session.rounds) {
      round.status = "waiting";
      round.updatedAt = Date.now();
      for (const [playerId, entry] of Object.entries(round.entries)) {
        resetPlayerState(entry, "pending");
        await this.storeResultImage(session.id, round.id, playerId, undefined);
      }
    }

    return this.save(session);
  }

  async validateHost(id: string, hostSecret: string) {
    const session = await this.load(id);
    if (!session) return false;
    return session.hostSecret === hostSecret;
  }

  private async generateSessionId(): Promise<string> {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    while (true) {
      let id = "";
      for (let i = 0; i < 6; i += 1) {
        id += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      let exists = false;
      if (redis) {
        exists = Boolean(await redis.exists(this.sessionKey(id)));
      } else {
        exists = memoryStore?.has(id) ?? false;
      }
      if (!exists) {
        return id;
      }
    }
  }
}

export const sessionStore = new SessionStore();

