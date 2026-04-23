"use client";

import { create } from "zustand";
import type { ClientIdentity, RoomPublicState } from "@/types/game";
import { supabase } from "@/lib/supabaseClient";
import { gameCommand } from "@/lib/supabaseGameApi";

type GameState = {
  identity: ClientIdentity | null;
  room: RoomPublicState | null;
  secretColorHex: string | null; // só para o descritor
  connected: boolean;
  lastError: string | null;
  roomId: string | null;
  unsub?: () => void;
  presenceUnsub?: () => void;
  setIdentity: (v: ClientIdentity | null) => void;
  connect: () => Promise<void>;
  createRoom: (
    name: string,
    roundsTotal?: number,
    opts?: { isPublic?: boolean; password?: string },
  ) => Promise<{ roomCode: string; playerId: string }>;
  joinRoom: (code: string, name: string, opts?: { password?: string }) => Promise<{ roomCode: string; playerId: string }>;
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
  roomId: null,

  setIdentity: (v) => {
    set({ identity: v });
    persistIdentity(v);
  },

  connect: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        // 422 aqui normalmente significa que "Anonymous sign-ins" está desativado no Supabase Auth.
        throw new Error(
          "Falha no login anônimo. Ative em Supabase → Authentication → Providers → Anonymous (ou use outro método de auth).",
        );
      }
    }
  },

  createRoom: async (name, roundsTotal, opts) => {
    await get().connect();
    const res = await gameCommand<{ ok: true; roomCode: string; roomId: string; playerId: string; playerToken: string }>({
      type: "create_room",
      name,
      roundsTotal,
      isPublic: opts?.isPublic,
      password: opts?.password,
    });
    const identity: ClientIdentity = { roomCode: res.roomCode, playerId: res.playerId, name, playerToken: res.playerToken };
    get().setIdentity(identity);
    set({ roomId: res.roomId, secretColorHex: null });
    await get().sync();
    return { roomCode: res.roomCode, playerId: res.playerId };
  },

  joinRoom: async (code, name, opts) => {
    await get().connect();
    const prev = get().identity;
    const playerId = prev?.roomCode?.toUpperCase() === code.toUpperCase() ? prev.playerId : undefined;
    const res = await gameCommand<{ ok: true; roomCode: string; roomId: string; playerId: string; playerToken: string }>({
      type: "join_room",
      code,
      name,
      playerId,
      password: opts?.password,
    });
    const identity: ClientIdentity = { roomCode: res.roomCode, playerId: res.playerId, name, playerToken: res.playerToken };
    get().setIdentity(identity);
    set({ roomId: res.roomId, secretColorHex: null });
    await get().sync();
    return { roomCode: res.roomCode, playerId: res.playerId };
  },

  startGame: async (roundsTotal) => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    await gameCommand({ type: "start_game", code: id.roomCode, playerId: id.playerId, roundsTotal, playerToken: id.playerToken } as any);
    await get().sync();
  },

  submitDescription: async (description) => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    await gameCommand({ type: "submit_description", code: id.roomCode, playerId: id.playerId, description, playerToken: id.playerToken } as any);
    await get().sync();
  },

  submitGuess: async (guessedHex) => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    await gameCommand({ type: "submit_guess", code: id.roomCode, playerId: id.playerId, guessedHex, playerToken: id.playerToken } as any);
    await get().sync();
  },

  nextRound: async () => {
    const id = get().identity;
    if (!id) throw new Error("SEM_IDENTIDADE");
    await gameCommand({ type: "next_round", code: id.roomCode, playerId: id.playerId, playerToken: id.playerToken } as any);
    set({ secretColorHex: null });
    await get().sync();
  },

  sync: async () => {
    const id = get().identity;
    if (!id) return;
    const code = id.roomCode.toUpperCase();
    const identity = id;

    // cleanup subscription anterior
    get().unsub?.();
    get().presenceUnsub?.();

    // resolve roomId se necessário
    let roomId = get().roomId;
    if (!roomId) {
      // roomId vem do identity em create/join; se não tiver, buscamos via Edge (com validação)
      const resp = await gameCommand<{ ok: true; state: { room: { id: string } } }>({
        type: "get_state",
        code,
        playerId: id.playerId,
        playerToken: id.playerToken,
      } as any);
      roomId = resp.state.room.id;
      set({ roomId });
    }
    if (!roomId) throw new Error("SALA_NAO_ENCONTRADA");

    async function fetchState() {
      const resp = await gameCommand<{
        ok: true;
        state: {
          room: any;
          players: any[];
          rounds: any[];
        };
      }>({ type: "get_state", code, playerId: identity.playerId, playerToken: identity.playerToken } as any);

      const roomRow = resp.state.room;
      const players = resp.state.players;
      const rounds = resp.state.rounds;

      const roundIndex = roomRow?.round_index ?? 0;
      const currentRoundRow = rounds?.find((r) => r.idx === roundIndex);
      const historyRows = (rounds ?? []).filter((r) => r.idx < roundIndex);

      const roomState: RoomPublicState = {
        id: roomRow!.id,
        code: roomRow!.code,
        hostId: roomRow!.host_player_id,
        status: roomRow!.status,
        phase: roomRow!.phase,
        roundsTotal: roomRow!.rounds_total,
        roundIndex: roomRow!.round_index,
        turnIndex: roomRow!.turn_index,
        players: (players ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          scoreTotal: Number(p.score_total ?? 0),
          attempts: p.attempts ?? 0,
          connected: !!p.connected,
        })),
        currentRound: currentRoundRow
          ? {
              id: currentRoundRow.id,
              index: currentRoundRow.idx,
              describerPlayerId: currentRoundRow.describer_player_id,
              guesserPlayerId: currentRoundRow.guesser_player_id,
              originalColorHex: currentRoundRow.original_color_hex ?? undefined,
              description: currentRoundRow.description ?? undefined,
              guessedColorHex: currentRoundRow.guessed_color_hex ?? undefined,
              deltaE: currentRoundRow.delta_e != null ? Number(currentRoundRow.delta_e) : undefined,
              score: currentRoundRow.score != null ? Number(currentRoundRow.score) : undefined,
              createdAt: new Date(currentRoundRow.created_at).getTime(),
            }
          : undefined,
        history: historyRows.map((r) => ({
          id: r.id,
          index: r.idx,
          describerPlayerId: r.describer_player_id,
          guesserPlayerId: r.guesser_player_id,
          originalColorHex: r.original_color_hex ?? undefined,
          description: r.description ?? undefined,
          guessedColorHex: r.guessed_color_hex ?? undefined,
          deltaE: r.delta_e != null ? Number(r.delta_e) : undefined,
          score: r.score != null ? Number(r.score) : undefined,
          createdAt: new Date(r.created_at).getTime(),
        })),
        updatedAt: new Date(roomRow!.updated_at).getTime(),
      };

      set({ room: roomState, connected: true });

      // anti-cheat: nunca pega segredo do banco. Se for minha vez de descrever, pede à Edge Function.
      const me = identity.playerId;
      const isDescriber = roomState.currentRound?.describerPlayerId === me && roomState.phase === "describe";
      if (!isDescriber) {
        set({ secretColorHex: null });
      } else {
        try {
          const resp = await gameCommand<{ ok: true; secret: string | null }>({
            type: "get_secret",
            code,
            playerId: me,
            playerToken: identity.playerToken,
          } as any);
          set({ secretColorHex: resp.secret });
        } catch {
          set({ secretColorHex: null });
        }
      }
    }

    await fetchState();

    // Presence (online/offline real) - não depende do banco
    const presenceChannel = supabase.channel(`presence:${code}`, {
      config: { presence: { key: identity.playerId } },
    });

    const applyPresence = () => {
      const state = presenceChannel.presenceState();
      const onlineIds = new Set<string>();
      for (const [key] of Object.entries(state)) onlineIds.add(key);

      set((prev) => {
        if (!prev.room) return prev;
        return {
          ...prev,
          room: {
            ...prev.room,
            players: prev.room.players.map((p) => ({ ...p, connected: onlineIds.has(p.id) })),
          },
        };
      });
    };

    presenceChannel.on("presence", { event: "sync" }, applyPresence);
    presenceChannel.on("presence", { event: "join" }, applyPresence);
    presenceChannel.on("presence", { event: "leave" }, applyPresence);

    await presenceChannel.subscribe(async (status) => {
      set({ connected: status === "SUBSCRIBED" });
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ playerId: identity.playerId, name: identity.name });
      }
    });

    set({
      presenceUnsub: () => {
        supabase.removeChannel(presenceChannel);
      },
    });

    const channel = supabase
      .channel(`room:${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => fetchState(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        () => fetchState(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` },
        () => fetchState(),
      )
      .subscribe((status) => {
        set({ connected: status === "SUBSCRIBED" });
      });

    set({
      unsub: () => {
        supabase.removeChannel(channel);
      },
    });
  },
}));

