'use client';

export const dynamic = "force-dynamic";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { ChangeEvent, FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ROLE_METADATA } from "@/constants/roles";
import type { SerializedSession } from "@/lib/sessionSerializer";
import {
  ROLE_LABELS,
  ROLE_ORDER,
  type PlayerRoundState,
  type PlayerStatus,
  type RoleId,
  type Round,
  type SessionStatus,
} from "@/types/session";

const MAX_PLAYERS = 6;
const MAX_ROUNDS = 4;
const COUNTDOWN_SECONDS = 30;
const POLL_INTERVAL = 2500;
const HOST_STORAGE_KEY = "dx-ai-host-session";
const PLAYER_STORAGE_KEY = "dx-ai-player-session";

type View = "landing" | "host" | "player";

type HostData = {
  hostSecret: string;
  session: SerializedSession;
};

type PlayerData = {
  sessionId: string;
  playerId: string;
  playerName: string;
  session: SerializedSession;
};

type HostMessageState = {
  error?: string;
  success?: string;
};

type ScoreRow = {
  playerId: string;
  name: string;
  perRound: (number | null)[];
  total: number;
};

type SubmitMode = "manual" | "auto";

const getRoundGoalImage = (round: Round) =>
  round.goalImageBase64
    ? `data:${round.goalImageMimeType ?? "image/jpeg"};base64,${round.goalImageBase64}`
    : null;

const buildScoreboard = (session: SerializedSession): ScoreRow[] =>
  session.players
    .map((player) => {
      const perRound = session.rounds.map(
        (round) => round.entries[player.id]?.score ?? null
      );
      // Only sum defined scores (coerce null to 0), but the final total must be `number`
      const total = perRound.reduce((sum: number, score) => sum + (score ?? 0), 0);
      return {
        playerId: player.id,
        name: player.name,
        perRound,
        total,
      };
    })
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

const getStatusBadgeColor = (status: SessionStatus | PlayerStatus) => {
  switch (status) {
    case "waiting":
      return "bg-slate-600 text-slate-100";
    case "pending":
      return "bg-slate-500/40 text-slate-200 border border-slate-500/40";
    case "collecting":
      return "bg-amber-500/20 text-amber-200 border border-amber-500/40";
    case "ready":
      return "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40";
    case "generating":
      return "bg-violet-500/20 text-violet-200 border border-violet-500/40";
    case "completed":
      return "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40";
    default:
      return "bg-slate-600 text-slate-100";
  }
};

const getStatusLabel = (status: SessionStatus | PlayerStatus) => {
  switch (status) {
    case "waiting":
      return "ยังไม่เริ่ม";
    case "pending":
      return "รอเริ่ม";
    case "collecting":
      return "กำลังเก็บ Prompt";
    case "ready":
      return "พร้อมสร้าง";
    case "generating":
      return "กำลังสร้าง";
    case "completed":
      return "เสร็จแล้ว";
    default:
      return status;
  }
};

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-night-900 text-gray-200">
          กำลังโหลดเกม...
        </div>
      }
    >
      <GameApp />
    </Suspense>
  );
}

function GameApp() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const joinParam = searchParams.get("join")?.toUpperCase() ?? "";

  const [view, setView] = useState<View>("landing");

  // Landing form states
  const [hostNameInput, setHostNameInput] = useState("");
  const [hostCreateLoading, setHostCreateLoading] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState(joinParam);
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);

  // Host/player session data
  const [hostData, setHostData] = useState<HostData | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);

  // Host helpers
  const [hostMessages, setHostMessages] = useState<HostMessageState>({});
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false);
  const [goalImageUploadingIndex, setGoalImageUploadingIndex] = useState<number | null>(null);
  const [generationLoading, setGenerationLoading] = useState<string | null>(null);
  const [scoringLoading, setScoringLoading] = useState<string | null>(null);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | null>(null);

  // Player helpers
  const [playerPrompt, setPlayerPrompt] = useState("");
  const [playerPromptSubmitting, setPlayerPromptSubmitting] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(COUNTDOWN_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [lastSubmittedMode, setLastSubmittedMode] = useState<SubmitMode | null>(null);
  const playerTimerSignatureRef = useRef<{
    roundIndex: number;
    roleIndex: number;
    status: PlayerStatus;
  } | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    src: string;
    title?: string;
    prompt?: string;
  } | null>(null);

  // Auto-open join screen when ?join=CODE
  useEffect(() => {
    if (joinParam) {
      setView("player");
      setJoinCodeInput(joinParam);
    }
  }, [joinParam]);

  // Poll session for host
  useEffect(() => {
    if (!hostData?.session.id) return;

    let active = true;
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${hostData.session.id}`, {
          cache: "no-store",
        });
        if (response.status === 404 || response.status === 403) {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(HOST_STORAGE_KEY);
          }
          if (active) {
            setHostData(null);
            setHostMessages({ error: "ห้องนี้หมดอายุหรือถูกรีเซ็ตแล้ว" });
            setView("landing");
          }
          return;
        }
        if (!response.ok) return;
        const payload = (await response.json()) as { session: SerializedSession };
        if (active) {
          setHostData((prev) => (prev ? { ...prev, session: payload.session } : prev));
        }
      } catch (error) {
        console.error("Failed to poll session", error);
      }
    };

    fetchSession();
    const interval = setInterval(fetchSession, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hostData?.session.id]);

  useEffect(() => {
    if (!playerData?.sessionId) return;

    let active = true;
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${playerData.sessionId}`, {
          cache: "no-store",
        });
        if (response.status === 404 || response.status === 403) {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
          }
          if (active) {
            setPlayerData(null);
            setView("landing");
            setLandingError("ห้องนี้ถูกปิดหรือหมดอายุแล้ว กรุณาเข้าร่วมใหม่");
          }
          return;
        }
        if (!response.ok) return;
        const payload = (await response.json()) as { session: SerializedSession };
        if (active) {
          setPlayerData((prev) => (prev ? { ...prev, session: payload.session } : prev));
        }
      } catch (error) {
        console.error("Failed to poll player session", error);
      }
    };

    fetchSession();
    const interval = setInterval(fetchSession, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [playerData?.sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hostData) return;
    try {
      const payload = {
        sessionId: hostData.session.id,
        hostSecret: hostData.hostSecret,
      };
      window.sessionStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Failed to persist host session", error);
    }
  }, [hostData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!playerData) return;
    try {
      const payload = {
        sessionId: playerData.sessionId,
        playerId: playerData.playerId,
        playerName: playerData.playerName,
      };
      window.sessionStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Failed to persist player session", error);
    }
  }, [playerData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hostData || view !== "landing") return;

    const stored = window.sessionStorage.getItem(HOST_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as { sessionId: string; hostSecret: string };
      if (!parsed.sessionId || !parsed.hostSecret) {
        window.sessionStorage.removeItem(HOST_STORAGE_KEY);
        return;
      }

      void (async () => {
        try {
          const response = await fetch(`/api/sessions/${parsed.sessionId}`, { cache: "no-store" });
          if (!response.ok) {
            window.sessionStorage.removeItem(HOST_STORAGE_KEY);
            return;
          }
          const payload = (await response.json()) as { session: SerializedSession };
          setHostData({ hostSecret: parsed.hostSecret, session: payload.session });
          setView("host");
        } catch (error) {
          console.error("Failed to restore host session", error);
          window.sessionStorage.removeItem(HOST_STORAGE_KEY);
        }
      })();
    } catch (error) {
      console.error("Failed to parse host session storage", error);
      window.sessionStorage.removeItem(HOST_STORAGE_KEY);
    }
  }, [hostData, view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (playerData || view !== "landing") return;

    const stored = window.sessionStorage.getItem(PLAYER_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as {
        sessionId: string;
        playerId: string;
        playerName?: string;
      };
      if (!parsed.sessionId || !parsed.playerId) {
        window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
        return;
      }

      void (async () => {
        try {
          const response = await fetch(`/api/sessions/${parsed.sessionId}`, { cache: "no-store" });
          if (!response.ok) {
            window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
            return;
          }
          const payload = (await response.json()) as { session: SerializedSession };
          const playerRecord = payload.session.players.find((player) => player.id === parsed.playerId);
          if (!playerRecord) {
            window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
            return;
          }

          setPlayerData({
            session: payload.session,
            sessionId: parsed.sessionId,
            playerId: parsed.playerId,
            playerName: parsed.playerName ?? playerRecord.name,
          });
          setView("player");
        } catch (error) {
          console.error("Failed to restore player session", error);
          window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
        }
      })();
    } catch (error) {
      console.error("Failed to parse player session storage", error);
      window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
    }
  }, [playerData, view]);

  const handleCreateSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLandingError(null);

    const trimmedName = hostNameInput.trim();
    if (!trimmedName) {
      setLandingError("กรุณาใส่ชื่อโฮสต์ก่อนเริ่มเกม");
      return;
    }

    setHostCreateLoading(true);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: trimmedName }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ไม่สามารถสร้างเกมได้");
      }

      const { session, hostSecret } = payload as {
        session: SerializedSession;
        hostSecret: string;
      };

      setHostData({ session, hostSecret });
      setView("host");
      setHostMessages({ success: "สร้างห้องเรียบร้อย! แชร์ QR ให้ผู้เล่นเข้าร่วมได้เลย" });
      router.replace("/");
    } catch (error) {
      console.error(error);
      setLandingError(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setHostCreateLoading(false);
    }
  };

  const handleJoinSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLandingError(null);

    const code = joinCodeInput.trim().toUpperCase();
    const name = playerNameInput.trim();

    if (!code || !name) {
      setLandingError("กรุณาใส่รหัสห้องและชื่อผู้เล่น");
      return;
    }

    setJoinLoading(true);
    try {
      const response = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ไม่สามารถเข้าร่วมห้องได้");
      }

      const { session, player } = payload as {
        session: SerializedSession;
        player: { id: string; name: string };
      };

      setPlayerData({ session, sessionId: session.id, playerId: player.id, playerName: player.name });
      setPlayerPrompt("");
      setPlayerError(null);
      setView("player");
      router.replace(`/?join=${code}`);
    } catch (error) {
      console.error(error);
      setLandingError(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเข้าร่วม");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleHostApiKeySave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hostData) return;

    const trimmed = apiKeyInput.trim();
    setApiKeySubmitting(true);
    setHostMessages({});
    try {
      const response = await fetch(`/api/sessions/${hostData.session.id}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-session-host-secret": hostData.hostSecret,
        },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "บันทึก API Key ไม่สำเร็จ");
      }

      setHostData((prev) => (prev ? { ...prev, session: payload.session } : prev));
      setApiKeyInput("");
      setHostMessages({ success: "บันทึก API Key เรียบร้อย" });
    } catch (error) {
      console.error(error);
      setHostMessages({ error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    } finally {
      setApiKeySubmitting(false);
    }
  };

  const handleGoalImageUpload = (roundIndex: number) => async (event: ChangeEvent<HTMLInputElement>) => {
    if (!hostData) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setGoalImageUploadingIndex(roundIndex);
    setHostMessages({});

    try {
      const reader = new FileReader();
      const fileReadPromise = new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ได้"));
        reader.onload = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(file);
      const dataUrl = await fileReadPromise;

      const response = await fetch(
        `/api/sessions/${hostData.session.id}/rounds/${roundIndex}/goal-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-host-secret": hostData.hostSecret,
          },
          body: JSON.stringify({ dataUrl }),
        },
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "อัปโหลดภาพไม่สำเร็จ");
      }

      setHostData((prev) => (prev ? { ...prev, session: payload.session } : prev));
      setHostMessages({ success: `อัปโหลด Goal Image รอบที่ ${roundIndex + 1} สำเร็จ` });
    } catch (error) {
      console.error(error);
      setHostMessages({ error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    } finally {
      setGoalImageUploadingIndex(null);
      event.target.value = "";
    }
  };

  const handleStartRound = async (roundIndex: number) => {
    if (!hostData) return;
    setHostMessages({});
    try {
      const response = await fetch(`/api/sessions/${hostData.session.id}/rounds/${roundIndex}/start`, {
        method: "POST",
        headers: { "x-session-host-secret": hostData.hostSecret },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ไม่สามารถเริ่มรอบได้");
      }
      setHostData((prev) => (prev ? { ...prev, session: payload.session } : prev));
      setHostMessages({ success: `เริ่มรอบที่ ${roundIndex + 1} แล้ว!` });
    } catch (error) {
      console.error(error);
      setHostMessages({ error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    }
  };

  const handleGenerateForPlayer = async (roundIndex: number, playerId: string) => {
    if (!hostData) return;
    setGenerationLoading(`${roundIndex}:${playerId}`);
    setHostMessages({});

    try {
      const response = await fetch(`/api/sessions/${hostData.session.id}/rounds/${roundIndex}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-host-secret": hostData.hostSecret,
        },
        body: JSON.stringify({ playerId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ไม่สามารถสร้างภาพได้");
      }
      setHostData((prev) => (prev ? { ...prev, session: payload.session } : prev));
      setHostMessages({ success: "สร้างภาพสำเร็จ!" });
    } catch (error) {
      console.error(error);
      setHostMessages({ error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    } finally {
      setGenerationLoading(null);
    }
  };

  const handleAssignScore = async (roundIndex: number, playerId: string, score: number) => {
    if (!hostData) return;
    setScoringLoading(`${roundIndex}:${playerId}`);
    setHostMessages({});
    try {
      const response = await fetch(`/api/sessions/${hostData.session.id}/rounds/${roundIndex}/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-host-secret": hostData.hostSecret,
        },
        body: JSON.stringify({ playerId, score }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ให้คะแนนไม่สำเร็จ");
      }
      setHostData((prev) => (prev ? { ...prev, session: payload.session } : prev));
      setHostMessages({ success: "บันทึกคะแนนเรียบร้อย" });
    } catch (error) {
      console.error(error);
      setHostMessages({ error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    } finally {
      setScoringLoading(null);
    }
  };

  const handleCopyJoinLink = async () => {
    const sessionId = hostData?.session.id;
    if (!sessionId) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}?join=${sessionId}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopyLinkFeedback("คัดลอกลิงก์เรียบร้อย");
      window.setTimeout(() => setCopyLinkFeedback(null), 2000);
    } catch (error) {
      console.error("Failed to copy join link", error);
      setCopyLinkFeedback("คัดลอกไม่สำเร็จ");
      window.setTimeout(() => setCopyLinkFeedback(null), 2000);
    }
  };

  const resetToLanding = () => {
    setView("landing");
    setHostData(null);
    setPlayerData(null);
    setHostMessages({});
    setPlayerPrompt("");
    setApiKeyInput("");
    setSecondsRemaining(COUNTDOWN_SECONDS);
    setTimerActive(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(HOST_STORAGE_KEY);
      window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
    }
  setImagePreview(null);
    router.replace("/");
  };

  const hostJoinUrl = useMemo(() => {
    if (!hostData?.session.id) return "";
    if (typeof window === "undefined") return `https://your-game-url/?join=${hostData.session.id}`;
    return `${window.location.origin}?join=${hostData.session.id}`;
  }, [hostData?.session.id]);

  const hostScoreboard = useMemo(() => (hostData ? buildScoreboard(hostData.session) : []), [hostData]);
  const playerScoreboard = useMemo(() => (playerData ? buildScoreboard(playerData.session) : []), [playerData]);

  const openImagePreview = (src: string, title?: string, prompt?: string) => {
    setImagePreview({ src, title, prompt });
  };

  const closeImagePreview = () => setImagePreview(null);

  const currentHostRoundIndex = hostData?.session.currentRoundIndex ?? -1;
  const currentHostRound =
    currentHostRoundIndex >= 0 ? hostData?.session.rounds[currentHostRoundIndex] ?? null : null;

  const currentPlayerRoundIndex = playerData?.session.currentRoundIndex ?? -1;
  const currentPlayerRound =
    currentPlayerRoundIndex >= 0 ? playerData?.session.rounds[currentPlayerRoundIndex] ?? null : null;

  const playerEntry: PlayerRoundState | undefined = useMemo(() => {
    if (!playerData || currentPlayerRoundIndex < 0) return undefined;
    const round = playerData.session.rounds[currentPlayerRoundIndex];
    return round?.entries[playerData.playerId];
  }, [playerData, currentPlayerRoundIndex]);

  const playerCurrentRole: RoleId | null = useMemo(() => {
    if (!playerEntry) return null;
    return playerEntry.status === "collecting"
      ? ROLE_ORDER[playerEntry.currentRoleIndex] ?? null
      : null;
  }, [playerEntry]);

  const playerGoalImage = useMemo(() => {
    if (!currentPlayerRound) return null;
    return getRoundGoalImage(currentPlayerRound);
  }, [currentPlayerRound]);

  useEffect(() => {
    if (!playerEntry || playerEntry.status !== "collecting") {
      setTimerActive(false);
      setSecondsRemaining(COUNTDOWN_SECONDS);
      playerTimerSignatureRef.current = null;
      return;
    }

    const signature = {
      roundIndex: currentPlayerRoundIndex,
      roleIndex: playerEntry.currentRoleIndex,
      status: playerEntry.status,
    };

    const prev = playerTimerSignatureRef.current;
    const hasChanged =
      !prev ||
      prev.roundIndex !== signature.roundIndex ||
      prev.roleIndex !== signature.roleIndex ||
      prev.status !== signature.status;

    playerTimerSignatureRef.current = signature;

    if (hasChanged) {
      setLastSubmittedMode(null);
      setSecondsRemaining(COUNTDOWN_SECONDS);
      setTimerActive(true);
    }
  }, [playerEntry, currentPlayerRoundIndex]);

  const handleSubmitPrompt = useCallback(
    async () => {
      if (!playerData || playerEntry?.status !== "collecting" || currentPlayerRoundIndex < 0) return;
      if (playerPromptSubmitting) return;

      const trimmed = playerPrompt.trim();
      if (!trimmed) {
        setPlayerError("กรุณาใส่ prompt ก่อนส่ง");
        return;
      }

      setPlayerPromptSubmitting(true);
      setPlayerError(null);

      try {
        const response = await fetch(
          `/api/sessions/${playerData.sessionId}/rounds/${currentPlayerRoundIndex}/prompts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: playerData.playerId, prompt: trimmed }),
          },
        );

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "ส่ง prompt ไม่สำเร็จ");
        }

        setPlayerData((prev) => (prev ? { ...prev, session: payload.session } : prev));
        setPlayerPrompt("");
        setSecondsRemaining(COUNTDOWN_SECONDS);
        setLastSubmittedMode("manual");
      } catch (error) {
        console.error(error);
        setPlayerError(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
      } finally {
        setPlayerPromptSubmitting(false);
      }
    },
    [
      currentPlayerRoundIndex,
      playerData,
      playerEntry?.status,
      playerPrompt,
      playerPromptSubmitting,
    ],
  );

  useEffect(() => {
    if (!timerActive) return;
    if (secondsRemaining <= 0) {
      setTimerActive(false);
      setPlayerError("หมดเวลาแล้ว กรุณากดส่งเพื่อไปส่วนต่อไป");
      return;
    }
    const id = window.setTimeout(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [secondsRemaining, timerActive]);

  const renderLandingView = () => (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="card rounded-2xl p-6">
        <h2 className="text-2xl font-semibold text-white">🎮 เริ่มเป็นโฮสต์</h2>
        <p className="mt-2 text-sm text-gray-300">สร้างห้องใหม่และตั้งค่า Goal Images ทั้ง 4 รอบ</p>
        <form onSubmit={handleCreateSession} className="mt-4 space-y-4">
          <div>
            <label htmlFor="host-name" className="block text-sm font-medium text-gray-300">
              ชื่อโฮสต์
            </label>
            <input
              id="host-name"
              type="text"
              value={hostNameInput}
              onChange={(event) => setHostNameInput(event.target.value)}
              className="prompt-textarea mt-1 w-full rounded-lg px-4 py-3 text-base"
              placeholder="เช่น DX Master"
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full rounded-full px-6 py-3 text-base font-semibold"
            disabled={hostCreateLoading}
          >
            {hostCreateLoading ? "กำลังสร้างห้อง..." : "สร้างห้องใหม่"}
          </button>
        </form>
      </div>

      <div className="card rounded-2xl p-6">
        <h2 className="text-2xl font-semibold text-white">🙋‍♀️ เข้าร่วมเป็นผู้เล่น</h2>
        <p className="mt-2 text-sm text-gray-300">ใส่รหัสห้องจากโฮสต์ กรอกชื่อ แล้วเตรียมพิมพ์ Prompt ทั้ง 5 ส่วน</p>
        <form onSubmit={handleJoinSession} className="mt-4 space-y-4">
          <div>
            <label htmlFor="room-code" className="block text-sm font-medium text-gray-300">
              รหัสห้อง (6 ตัวอักษร)
            </label>
            <input
              id="room-code"
              type="text"
              value={joinCodeInput}
              onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
              className="prompt-textarea mt-1 w-full rounded-lg px-4 py-3 text-base uppercase"
              placeholder="เช่น ABC123"
              maxLength={6}
              required
            />
          </div>
          <div>
            <label htmlFor="player-name" className="block text-sm font-medium text-gray-300">
              ชื่อเล่น
            </label>
            <input
              id="player-name"
              type="text"
              value={playerNameInput}
              onChange={(event) => setPlayerNameInput(event.target.value)}
              className="prompt-textarea mt-1 w-full rounded-lg px-4 py-3 text-base"
              placeholder="ชื่อที่จะแสดงบนหน้าจอ"
              required
            />
          </div>
          <button
            type="submit"
            className="btn-secondary w-full rounded-full px-6 py-3 text-base font-semibold"
            disabled={joinLoading}
          >
            {joinLoading ? "กำลังเข้าร่วม..." : "เข้าร่วมเกม"}
          </button>
        </form>
      </div>

      {landingError && (
        <div className="md:col-span-2">
          <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-4 text-sm text-red-200">
            {landingError}
          </div>
        </div>
      )}
    </section>
  );

  const renderRoundStatusBadge = (status: SessionStatus | PlayerStatus) => (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeColor(status)}`}>
      {getStatusLabel(status)}
    </span>
  );

  const renderHostView = () => {
    if (!hostData) return null;

    const { session } = hostData;
    const canStartRounds = session.hasApiKey && session.rounds.every((round) => round.goalImageBase64);

    const roundCards = session.rounds.map((round, index) => {
      const goalImage = getRoundGoalImage(round);
      const previousRoundsCompleted = session.rounds
        .slice(0, index)
        .every((item) => item.status === "completed");
      const isCurrent = session.currentRoundIndex === index;
      const canStart =
        session.hasApiKey &&
        Boolean(round.goalImageBase64) &&
        previousRoundsCompleted &&
        (session.currentRoundIndex === -1 || isCurrent || session.currentRoundIndex < index);

      return (
        <div key={round.id} className="rounded-2xl bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">รอบที่ {round.index}</h3>
            {renderRoundStatusBadge(round.status)}
          </div>
          <p className="mt-2 text-xs text-gray-400">ตั้ง Goal Image สำหรับรอบนี้ก่อนเริ่ม</p>
          <div className="mt-3 space-y-3">
            {goalImage ? (
              <Image
                src={goalImage}
                alt={`Goal round ${round.index}`}
                width={360}
                height={360}
                className="w-full rounded-lg object-cover"
                sizes="(max-width: 768px) 100vw, 240px"
                unoptimized
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-lg border border-dashed border-gray-600 text-sm text-gray-500">
                ยังไม่มีรูป Goal Image
              </div>
            )}
            <label className="block">
              <span className="btn-secondary inline-flex w-full cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-semibold">
                {goalImageUploadingIndex === index ? "กำลังอัปโหลด..." : "อัปโหลด / เปลี่ยนรูป"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleGoalImageUpload(index)}
                className="hidden"
                disabled={goalImageUploadingIndex !== null}
              />
            </label>
            <button
              type="button"
              onClick={() => handleStartRound(index)}
              className="btn-primary w-full rounded-full px-4 py-2 text-sm font-semibold"
              disabled={!canStart || round.status === "collecting" || goalImageUploadingIndex !== null}
            >
              {round.status === "collecting" ? "กำลังเล่นรอบนี้" : `เริ่มรอบที่ ${index + 1}`}
            </button>
          </div>
        </div>
      );
    });

    const roundEntries = currentHostRound
      ? session.players.map((player) => ({
          player,
          entry: currentHostRound.entries[player.id],
        }))
      : [];

    return (
      <section className="space-y-8">
        <div className="card rounded-2xl p-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-2xl font-semibold text-white">โฮสต์: {session.hostName}</h2>
            <p className="text-sm text-gray-300">แชร์รหัสหรือสแกน QR เพื่อเข้าร่วม</p>
            <div className="flex flex-col items-center gap-2 text-sm text-gray-200">
              <p>
                <span className="font-semibold text-violet-300">Room Code:</span> {session.id}
              </p>
              <div className="break-all text-xs text-gray-400">{hostJoinUrl}</div>
              <p>ผู้เล่นเข้าร่วมแล้ว: {session.players.length}/{MAX_PLAYERS}</p>
            </div>
            <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-xl bg-white/90 p-3 text-slate-900">
              <QRCodeCanvas value={hostJoinUrl || session.id} size={200} bgColor="#ffffff" fgColor="#1a1a2e" includeMargin />
              <button
                type="button"
                onClick={handleCopyJoinLink}
                className="w-full rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-900"
              >
                คัดลอกลิงก์
              </button>
              {copyLinkFeedback && <p className="text-center text-[11px] text-slate-600">{copyLinkFeedback}</p>}
            </div>
            <button
              type="button"
              onClick={resetToLanding}
              className="btn-secondary rounded-full px-4 py-2 text-sm"
            >
              ออกจากโหมดโฮสต์
            </button>
          </div>
        </div>

        <div className="card rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white">🖼️ ตั้งค่า Goal Image (4 รอบ)</h3>
          <p className="mt-1 text-xs text-gray-400">เตรียมรูปอ้างอิงทั้ง 4 รอบล่วงหน้า</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-4">{roundCards}</div>
        </div>

        <div className="card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">👥 ผู้เล่นที่เข้าร่วม</h3>
            <span className="text-xs text-gray-400">ทั้งหมด {session.players.length} / {MAX_PLAYERS}</span>
          </div>
          {session.players.length === 0 ? (
            <p className="text-sm text-gray-300">ยังไม่มีผู้เล่นเข้าร่วม โปรดแชร์ลิงก์หรือ QR Code ให้เพื่อนๆ</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {session.players.map((player) => {
                const roundStatuses = session.rounds.map(
                  (round) => round.entries[player.id]?.status ?? "pending",
                );
                const currentStatus = currentHostRound?.entries[player.id]?.status ?? "pending";
                return (
                  <div key={player.id} className="flex h-full flex-col rounded-xl bg-black/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">{player.name}</p>
                        <p className="text-xs text-gray-400">
                          สถานะปัจจุบัน: {renderRoundStatusBadge(currentStatus)}
                        </p>
                      </div>
                      <span className="text-[11px] text-gray-500">
                        เข้าร่วมเมื่อ {new Date(player.joinedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs grid-cols-2 xl:grid-cols-4">
                      {session.rounds.map((round, idx) => (
                        <div key={`${player.id}-${round.id}`} className="rounded-lg bg-white/5 p-2 text-center">
                          <p className="font-semibold text-violet-300">รอบ {round.index}</p>
                          <p className="mt-1 text-gray-200">{getStatusLabel(roundStatuses[idx])}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {currentHostRound && (
          <div className="card rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">🎯 รอบที่ {currentHostRound.index}</h3>
                <p className="text-sm text-gray-300">สถานะ: {renderRoundStatusBadge(currentHostRound.status)}</p>
              </div>
              {getRoundGoalImage(currentHostRound) && (
                <Image
                  src={getRoundGoalImage(currentHostRound) as string}
                  alt="Goal image"
                  width={200}
                  height={200}
                  className="h-24 w-24 rounded-lg object-cover"
                  unoptimized
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {roundEntries.map(({ player, entry }) => (
                <div
                  key={`${currentHostRound.id}-${player.id}`}
                  className="flex h-full flex-col rounded-xl bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-white">{player.name}</h4>
                      <p className="text-xs text-gray-400">
                        สถานะ: {renderRoundStatusBadge((entry?.status as SessionStatus) ?? "waiting")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px] text-gray-400">
                      <span>
                        Progress: {entry ? Math.min(entry.currentRoleIndex, ROLE_ORDER.length) : 0} / {ROLE_ORDER.length}
                      </span>
                      {entry?.status === "collecting" && <span className="text-amber-300">รอ Prompt ส่วนต่อไป</span>}
                    </div>
                  </div>

                  <div className="mt-3 flex-1 overflow-hidden">
                    <div className="grid gap-2 text-xs text-gray-300">
                      {ROLE_ORDER.map((roleId) => (
                        <div key={roleId} className="rounded-lg bg-black/30 p-2">
                          <p className="font-semibold text-violet-300">{ROLE_LABELS[roleId]}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-200 max-h-20 overflow-y-auto">
                            {entry?.prompts[roleId] || "ยังไม่มีคำอธิบาย"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {entry?.resultImage && (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        className="overflow-hidden rounded-lg bg-black/40"
                        onClick={() =>
                          openImagePreview(
                            `data:image/png;base64,${entry.resultImage}`,
                            `${player.name} – รอบที่ ${currentHostRound.index}`,
                            entry.finalPrompt ?? "",
                          )
                        }
                      >
                        <Image
                          src={`data:image/png;base64,${entry.resultImage}`}
                          alt={`${player.name} result`}
                          width={512}
                          height={512}
                          className="h-48 w-full cursor-zoom-in object-cover"
                          unoptimized
                        />
                      </button>
                      <p className="text-xs text-gray-300 whitespace-pre-wrap max-h-20 overflow-y-auto">{entry.finalPrompt}</p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateForPlayer(currentHostRoundIndex, player.id)}
                        className="btn-primary rounded-full px-3 py-2 text-xs font-semibold"
                        disabled={
                          entry?.status !== "ready" ||
                          generationLoading === `${currentHostRoundIndex}:${player.id}`
                        }
                      >
                        {generationLoading === `${currentHostRoundIndex}:${player.id}`
                          ? "กำลังสร้าง..."
                          : entry?.resultImage
                          ? "สร้างใหม่"
                          : "สร้างภาพ"}
                      </button>
                      {entry?.resultImage && (
                        <div className="flex items-center gap-1 text-[11px] text-gray-400">
                          <span>คะแนน:</span>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <button
                              key={score}
                              type="button"
                              onClick={() => handleAssignScore(currentHostRoundIndex, player.id, score)}
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                                entry.score === score
                                  ? "bg-emerald-500 text-white"
                                  : "bg-white/10 text-gray-200 hover:bg-white/20"
                              }`}
                              disabled={scoringLoading === `${currentHostRoundIndex}:${player.id}`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {entry?.resultImage && (
                      <a
                        href={`data:image/png;base64,${entry.resultImage}`}
                        download={`round-${currentHostRound.index}-${player.name}.png`}
                        className="btn-secondary rounded-full px-3 py-2 text-xs"
                      >
                        ดาวน์โหลดภาพ
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white">🏆 สรุปคะแนนรวม</h3>
          <p className="text-xs text-gray-400">คะแนนจะปรากฏเมื่อโฮสต์ประเมินแต่ละรูป (1-5 คะแนนต่อรอบ)</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm text-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-400">ผู้เล่น</th>
                  {session.rounds.map((round) => (
                    <th key={round.id} className="px-4 py-2 text-center text-xs uppercase tracking-wide text-gray-400">
                      รอบ {round.index}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-center text-xs uppercase tracking-wide text-gray-400">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {hostScoreboard.map((row) => (
                  <tr key={row.playerId}>
                    <td className="px-4 py-2 font-semibold text-white">{row.name}</td>
                    {row.perRound.map((score, idx) => (
                      <td key={`${row.playerId}-${idx}`} className="px-4 py-2 text-center">
                        {score ?? "-"}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center font-semibold text-violet-300">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {session.rounds.some((round) =>
          session.players.some((player) => round.entries[player.id]?.resultImage)
        ) && (
          <div className="card rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">🖼️ แกลเลอรีผลลัพธ์ทุกคน</h3>
            <div className="space-y-6">
              {session.rounds.map((round) => {
                const entriesWithImages = session.players
                  .map((player) => ({ player, entry: round.entries[player.id] }))
                  .filter(({ entry }) => Boolean(entry?.resultImage));

                if (entriesWithImages.length === 0) {
                  return (
                    <div key={round.id} className="rounded-lg bg-black/20 p-4 text-xs text-gray-400">
                      รอบที่ {round.index} ยังไม่มีรูปที่สร้างสำเร็จ
                    </div>
                  );
                }

                return (
                  <div key={round.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-base font-semibold text-violet-200">รอบที่ {round.index}</h4>
                      <span className="text-xs text-gray-400">{getStatusLabel(round.status)}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {entriesWithImages.map(({ player, entry }) => (
                        <div key={`${round.id}-${player.id}`} className="space-y-3 rounded-xl bg-white/5 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-white">{player.name}</span>
                            {entry?.score != null && (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200">
                                คะแนน {entry.score}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="block overflow-hidden rounded-lg bg-black/40"
                            onClick={() =>
                              openImagePreview(
                                `data:image/png;base64,${entry?.resultImage ?? ""}`,
                                `${player.name} – รอบที่ ${round.index}`,
                                entry?.finalPrompt ?? "",
                              )
                            }
                          >
                            <Image
                              src={`data:image/png;base64,${entry?.resultImage ?? ""}`}
                              alt={`${player.name} รอบที่ ${round.index}`}
                              width={640}
                              height={640}
                              className="h-48 w-full cursor-zoom-in object-cover"
                              unoptimized
                            />
                          </button>
                          <p className="text-xs text-gray-300 whitespace-pre-wrap max-h-24 overflow-y-auto">
                            {entry?.finalPrompt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hostMessages.error && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-4 text-xs text-red-200">
            {hostMessages.error}
          </div>
        )}
        {hostMessages.success && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-900/20 p-4 text-xs text-emerald-200">
            {hostMessages.success}
          </div>
        )}
      </section>
    );
  };

  const renderPlayerView = () => {
    if (!playerData) {
      return (
        <section className="flex w-full items-center justify-center">
          <div className="card w-full max-w-md rounded-2xl p-6 shadow-xl">
            <h2 className="text-2xl font-semibold text-white">เข้าร่วมเกม</h2>
            <p className="mt-2 text-sm text-gray-300">กรอกชื่อเล่นและยืนยันรหัสห้องเพื่อเริ่มเล่น</p>
            <form onSubmit={handleJoinSession} className="mt-4 space-y-4">
              <div>
                <label htmlFor="player-room-code" className="block text-sm font-medium text-gray-300">
                  รหัสห้อง
                </label>
                <input
                  id="player-room-code"
                  type="text"
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                  className="prompt-textarea mt-1 w-full rounded-lg px-4 py-3 text-base uppercase"
                  placeholder="เช่น ABC123"
                  maxLength={6}
                  required
                />
              </div>
              <div>
                <label htmlFor="player-display-name" className="block text-sm font-medium text-gray-300">
                  ชื่อเล่น
                </label>
                <input
                  id="player-display-name"
                  type="text"
                  value={playerNameInput}
                  onChange={(event) => setPlayerNameInput(event.target.value)}
                  className="prompt-textarea mt-1 w-full rounded-lg px-4 py-3 text-base"
                  placeholder="ชื่อที่จะแสดงบนหน้าจอ"
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full rounded-full px-6 py-3 text-base font-semibold"
                disabled={joinLoading}
              >
                {joinLoading ? "กำลังเข้าร่วม..." : "ยืนยันการเข้าร่วม"}
              </button>
            </form>
            {landingError && (
              <p className="mt-3 text-xs text-red-300">{landingError}</p>
            )}
          </div>
        </section>
      );
    }

    const { session, playerId, playerName } = playerData;

    const scoreboard = playerScoreboard;

    return (
      <section className="space-y-6">
        <div className="card rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-white">สวัสดี {playerName}</h2>
              <p className="text-sm text-gray-300">
                ห้อง: <span className="font-semibold text-violet-300">{session.id}</span> · โฮสต์: {session.hostName}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                สถานะเกม: {getStatusLabel(session.status)} (รอบทั้งหมด {MAX_ROUNDS})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetToLanding}
                className="btn-secondary rounded-full px-4 py-2 text-sm"
              >
                ออกจากห้อง
              </button>
              <button
                type="button"
                className="btn-secondary rounded-full px-4 py-2 text-sm"
                onClick={() => {
                  setSecondsRemaining(COUNTDOWN_SECONDS);
                  setPlayerPrompt("");
                  playerTimerSignatureRef.current = null;
                  setTimerActive(true);
                }}
              >
                รีเฟรชตัวจับเวลา
              </button>
            </div>
          </div>
        </div>

        {currentPlayerRound && (
          <div className="card rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">รอบที่ {currentPlayerRound.index}</h3>
                <p className="text-xs text-gray-400">สถานะรอบ: {getStatusLabel(currentPlayerRound.status)}</p>
              </div>
              {playerGoalImage && (
                <Image
                  src={playerGoalImage}
                  alt="Goal"
                  width={160}
                  height={160}
                  className="h-20 w-20 rounded-lg object-cover"
                  unoptimized
                />
              )}
            </div>

            {playerEntry?.status === "collecting" && playerCurrentRole && (
              <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">ถึงคิวของคุณสำหรับ {ROLE_LABELS[playerCurrentRole]}</p>
                    <p className="text-xs text-gray-300">กรอกคำอธิบายให้ชัดเจนที่สุดภายใน {COUNTDOWN_SECONDS} วินาที</p>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-2xl font-bold text-amber-300">
                    {secondsRemaining}
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-violet-200">
                  {ROLE_METADATA[playerCurrentRole].guidelines.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmitPrompt();
                  }}
                  className="mt-4 space-y-3"
                >
                  <textarea
                    value={playerPrompt}
                    onChange={(event) => setPlayerPrompt(event.target.value)}
                    className="prompt-textarea h-32 w-full rounded-lg px-4 py-3 text-sm"
                    placeholder="พิมพ์รายละเอียดที่ต้องการ"
                  />
                  <button
                    type="submit"
                    className="btn-primary w-full rounded-full px-4 py-3 text-sm font-semibold"
                    disabled={playerPromptSubmitting}
                  >
                {playerPromptSubmitting ? "กำลังส่ง..." : "ส่ง Prompt"}
                  </button>
                </form>
                {playerError && <p className="mt-2 text-xs text-red-300">{playerError}</p>}
                {lastSubmittedMode === "auto" && (
                  <p className="mt-2 text-xs text-amber-300">ระบบส่งข้อความให้อัตโนมัติเนื่องจากหมดเวลา</p>
                )}
              </div>
            )}

            {playerEntry && playerEntry.status !== "collecting" && (
              <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-200">
                <p>
                  สถานะของคุณ: <span className="font-semibold text-violet-300">{getStatusLabel(playerEntry.status)}</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {playerEntry.status === "ready"
                    ? "รอโฮสต์สั่งสร้างภาพ"
                    : playerEntry.status === "generating"
                    ? "โฮสต์กำลังสร้างภาพจาก Prompt ของคุณ"
                    : playerEntry.status === "completed"
                    ? "ชมผลงานและรอคะแนนจากโฮสต์"
                    : "รอรอบถัดไป"}
                </p>
              </div>
            )}

            {playerEntry && (
              <div className="grid gap-3 md:grid-cols-2">
                {ROLE_ORDER.map((roleId) => (
                  <div key={roleId} className="rounded-lg bg-black/40 p-3 text-xs text-gray-300">
                    <p className="font-semibold text-violet-300">{ROLE_LABELS[roleId]}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-200">
                      {playerEntry.prompts[roleId] || "ยังไม่ได้ส่ง"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {playerEntry?.resultImage && (
              <div className="rounded-xl bg-black/60 p-4 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    className="h-40 w-40 overflow-hidden rounded-lg bg-black/40"
                    onClick={() =>
                      openImagePreview(
                        `data:image/png;base64,${playerEntry.resultImage}`,
                        `${playerName} – รอบที่ ${currentPlayerRound?.index ?? 0}`,
                        playerEntry.finalPrompt ?? "",
                      )
                    }
                  >
                    <Image
                      src={`data:image/png;base64,${playerEntry.resultImage}`}
                      alt="ผลลัพธ์"
                      width={360}
                      height={360}
                      className="h-full w-full cursor-zoom-in object-cover"
                      unoptimized
                    />
                  </button>
                  <div className="flex-1 space-y-2 text-xs text-gray-300">
                    <h4 className="text-base font-semibold text-white">ผลงานของคุณ</h4>
                    <p className="whitespace-pre-wrap text-sm text-gray-200">{playerEntry.finalPrompt}</p>
                    <button
                      type="button"
                      className="btn-secondary rounded-full px-4 py-2 text-xs"
                      onClick={() =>
                        openImagePreview(
                          `data:image/png;base64,${playerEntry.resultImage}`,
                          `${playerName} – รอบที่ ${currentPlayerRound?.index ?? 0}`,
                          playerEntry.finalPrompt ?? "",
                        )
                      }
                    >
                      ขยายดูภาพ
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-300">
                  <span>คะแนนที่ได้รับ: {playerEntry.score ?? "รอการประเมิน"}</span>
                  <a
                    href={`data:image/png;base64,${playerEntry.resultImage}`}
                    download={`round-${currentPlayerRound?.index ?? 0}-${playerName}.png`}
                    className="btn-secondary rounded-full px-4 py-2 text-xs"
                  >
                    ดาวน์โหลดภาพ
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white">🏆 คะแนนรวม</h3>
          <p className="text-xs text-gray-400">ดูคะแนนของทุกคนตลอด 4 รอบ</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm text-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-400">ผู้เล่น</th>
                  {session.rounds.map((round) => (
                    <th key={round.id} className="px-4 py-2 text-center text-xs uppercase tracking-wide text-gray-400">
                      รอบ {round.index}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-center text-xs uppercase tracking-wide text-gray-400">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scoreboard.map((row) => (
                  <tr key={row.playerId} className={row.playerId === playerId ? "bg-white/5" : undefined}>
                    <td className="px-4 py-2 font-semibold text-white">{row.name}</td>
                    {row.perRound.map((score, idx) => (
                      <td key={`${row.playerId}-${idx}`} className="px-4 py-2 text-center">
                        {score ?? "-"}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center font-semibold text-violet-300">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <main className="mx-auto w-full max-w-6xl space-y-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            LISA AI Crazy Image : <span className="text-violet-400">สร้างรูปภาพด้วยกันด้วย AI</span>
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            ช่วยกันสร้างภาพแต่ละส่วนตั้งแต่หัวจรดท้า พร้อมท่าทางและสถานที่จากรูปต้นแบบ
          </p>
        </header>

        {view === "landing" && renderLandingView()}
        {view === "host" && renderHostView()}
        {view === "player" && renderPlayerView()}
      </main>
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-5xl space-y-4 rounded-2xl bg-night-900 p-6 shadow-2xl">
            <button
              type="button"
              onClick={closeImagePreview}
              className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              ปิด
            </button>
            {imagePreview.title && <h3 className="pr-16 text-lg font-semibold text-white">{imagePreview.title}</h3>}
            <div className="max-h-[70vh] overflow-auto">
              <Image
                src={imagePreview.src}
                alt={imagePreview.title ?? "result-preview"}
                width={1280}
                height={1280}
                className="w-full rounded-xl object-contain"
                unoptimized
              />
            </div>
            {imagePreview.prompt && (
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{imagePreview.prompt}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}