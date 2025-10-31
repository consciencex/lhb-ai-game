export type RoleId = "head" | "torso" | "legs" | "pose" | "background";

export const ROLE_ORDER: RoleId[] = ["head", "torso", "legs", "pose", "background"];

export const ROLE_LABELS: Record<RoleId, string> = {
  head: "1) Head",
  torso: "2) Torso & Arms",
  legs: "3) Legs & Lower Body",
  pose: "4) Pose",
  background: "5) Background",
};

export type SessionStatus = "waiting" | "collecting" | "ready" | "generating" | "completed";
export type PlayerStatus = "pending" | "collecting" | "ready" | "generating" | "completed";

export type PromptMap = Record<RoleId, string | null>;

export interface PlayerRoundState {
  prompts: PromptMap;
  currentRoleIndex: number;
  status: PlayerStatus;
  finalPrompt?: string;
  resultImage?: string;
  score?: number;
  generatedAt?: number;
  updatedAt?: number;
}

export interface Round {
  id: string;
  index: number;
  goalImageBase64?: string;
  goalImageMimeType?: string;
  status: SessionStatus;
  entries: Record<string, PlayerRoundState>;
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  prompts: PromptMap;
  currentRoleIndex: number;
  status: PlayerStatus;
  finalPrompt?: string;
  resultImage?: string;
  generatedAt?: number;
}

export interface Session {
  id: string;
  hostSecret?: string;
  hostName: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  apiKey?: string;
  goalImageBase64?: string;
  goalImageMimeType?: string;
  currentRoundIndex: number;
  players: Player[];
  rounds: Round[];
}

