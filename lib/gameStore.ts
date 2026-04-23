"use client";

import { create } from "zustand";
import type { ClientIdentity, RoomPublicState } from "@/types/game";
import { getSocket } from "@/lib/socketClient";

type GameState = {
  identity: ClientIdentity | null;
  room: RoomPublicState | null;
  secretColorHex: string | null; // só para o descritor
  connected: boolean;
  lastError: string | null;
  setIdentity: (v: ClientIdentity | null) => void;
  connect: () => Promise<void>;
  createRoom: (name: string, roundsTotal?: number) => Promise<{ roomCode: string; playerId: string }>;
  joinRoom: (code: string, name: string) => Promise<{ roomCode: string; playerId: string }>;
  startGame: (roundsTotal?: number) => Promise<void>;
  submitDescription: (description: string) => Promise<void>;
  submitGuess: (guessedHex: string) => Promise<void>;
  nextRound: () => Promise<void>;
  sync: () => Promise<void>;
};

function persistIdentity(id: ClientIdentity | null) {
  if (typeof window === "undefined") return;
  if (!id) {
    window.localStorage.removeItem("cm_identity");
    return;
  }
  window.localStorage.setItem("cm_identity", JSON.stringify(id));
}

export function readPersistedIdentity(): ClientIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("cm_identity");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClientIdentity;
  } catch {
    return null;
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  identity: null,
  room: null,
  secretColorHex: null,
  connected: false,
  lastError: null,

  setIdentity: (v) => {
    set({ identity: v });
    persistIdentity(v);
  },

  connect: async () => {
    const socket = await getSocket();
    socket.off();

    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));

    socket.on("room:state", (room: RoomPublicState) => {
      set({ room });
    });

    socket.on("round:secretColor", ({ hex }: { hex: string }) => {
      set({ secretColorHex: hex });
    });

    socket.on("app:error", ({ message }: { message: string }) => {
      set({ lastError: message });
    });

    set({ connected: socket.connected });
  },

  createRoom: async (name, roundsTotal) => {
    await get().connect();
    const socket = await getSocket();

    const res = await new Promise<{ ok: boolean; room?: RoomPublicState; playerId?: string }>((resolve) => {
      socket.emit("room:create", { name, roundsTotal }, resolve);
    });

    if (!res.ok || !res.room || !res.playerId) throw new Error("FALHA_CRIAR_SALA");
    const identity: ClientIdentity = { roomCode: res.room.code, playerId: res.playerId, name };
    get().setIdentity(identity);
    set({ room: res.room, secretColorHex: null });
    return { roomCode: res.room.code, playerId: res.playerId };
  },

  joinRoom: async (code, name) => {
    await get().connect();
    const socket = await getSocket();
    const prev = get().identity;
    const playerId = prev?.roomCode?.toUpperCase() === code.toUpperCase() ? prev.playerId : undefined;

    const res = await new Promise<{ ok: boolean; room?: RoomPublicState; playerId?: string }>((resolve) => {
      socket.emit("room:join", { code, name, playerId }, resolve);
    });

    if (!res.ok || !res.room || !res.playerId) throw new Error("FALHA_ENTRAR_SALA");
    const identity: ClientIdentity = { roomCode: res.room.code, playerId: res.playerId, name };
    get().setIdentity(identity);
    set({ room: res.room, secretColorHex: null });
    return { roomCode: res.room.code, playerId: res.playerId };
  },

  startGame: async (roundsTotal) => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    const socket = await getSocket();
    await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit("room:start", { code: id.roomCode, playerId: id.playerId, roundsTotal }, resolve);
    });
  },

  submitDescription: async (description) => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    const socket = await getSocket();
    await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit("round:submitDescription", { code: id.roomCode, playerId: id.playerId, description }, resolve);
    });
  },

  submitGuess: async (guessedHex) => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    const socket = await getSocket();
    await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit("round:submitGuess", { code: id.roomCode, playerId: id.playerId, guessedHex }, resolve);
    });
  },

  nextRound: async () => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    const socket = await getSocket();
    await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit("round:next", { code: id.roomCode, playerId: id.playerId }, resolve);
    });
    set({ secretColorHex: null });
  },

  sync: async () => {
    const id = get().identity;
    if (!id) return;
    const socket = await getSocket();
    socket.emit("room:sync", { code: id.roomCode });
  },
}));

