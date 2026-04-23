import { nanoid } from "nanoid";
import type { Player, RoomPublicState, Round } from "@/types/game";
import { deltaE2000, randomHexColor, scoreFromDeltaE } from "@/server/color";

type PlayerInternal = Player & { socketId?: string };

type RoomInternal = Omit<RoomPublicState, "players" | "history" | "currentRound"> & {
  players: PlayerInternal[];
  history: Round[];
  currentRound?: Round & { originalColorHexPrivate?: string };
};

const roomsByCode = new Map<string, RoomInternal>();
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeRoomCode(len = 5) {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += roomCodeAlphabet[Math.floor(Math.random() * roomCodeAlphabet.length)];
  }
  return code;
}

function now() {
  return Date.now();
}

function toPublic(room: RoomInternal): RoomPublicState {
  const current = room.currentRound
    ? {
        ...room.currentRound,
        // nunca vaza o privado
        originalColorHexPrivate: undefined,
      }
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { originalColorHexPrivate, ...currentRoundPublic } = (current as any) ?? {};

  return {
    ...room,
    players: room.players.map(({ socketId: _s, ...p }) => p),
    history: room.history,
    currentRound: current ? (currentRoundPublic as any) : undefined,
  };
}

function getOrThrow(code: string) {
  const room = roomsByCode.get(code.toUpperCase());
  if (!room) throw new Error("SALA_NAO_ENCONTRADA");
  return room;
}

function touch(room: RoomInternal) {
  room.updatedAt = now();
}

export function createRoom(hostName: string, roundsTotal = 8) {
  let code = makeRoomCode();
  while (roomsByCode.has(code)) code = makeRoomCode();

  const hostId = nanoid();
  const roomId = nanoid();
  const player: PlayerInternal = {
    id: hostId,
    name: hostName,
    scoreTotal: 0,
    connected: true,
  };

  const room: RoomInternal = {
    id: roomId,
    code,
    hostId,
    status: "lobby",
    phase: "lobby",
    roundsTotal,
    roundIndex: 0,
    turnIndex: 0,
    players: [player],
    history: [],
    updatedAt: now(),
  };

  roomsByCode.set(code, room);
  return { room: toPublic(room), playerId: hostId };
}

export function joinRoom(code: string, name: string, playerId?: string) {
  const room = getOrThrow(code);

  let player = playerId ? room.players.find((p) => p.id === playerId) : undefined;
  if (!player) {
    const id = nanoid();
    player = { id, name, scoreTotal: 0, connected: true };
    room.players.push(player);
    touch(room);
    return { room: toPublic(room), playerId: id, isNew: true };
  }

  player.connected = true;
  if (name) player.name = name;
  touch(room);
  return { room: toPublic(room), playerId: player.id, isNew: false };
}

export function attachSocket(code: string, playerId: string, socketId: string) {
  const room = getOrThrow(code);
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("JOGADOR_NAO_ENCONTRADO");
  player.socketId = socketId;
  player.connected = true;
  touch(room);
  return toPublic(room);
}

export function markDisconnectedBySocket(socketId: string) {
  for (const room of roomsByCode.values()) {
    const p = room.players.find((x) => x.socketId === socketId);
    if (p) {
      p.connected = false;
      p.socketId = undefined;
      touch(room);
      return { roomCode: room.code, room: toPublic(room) };
    }
  }
  return null;
}

function startNextRound(room: RoomInternal) {
  if (room.players.length < 2) throw new Error("MINIMO_2_JOGADORES");
  if (room.roundIndex >= room.roundsTotal) {
    room.status = "finished";
    room.phase = "finished";
    room.currentRound = undefined;
    touch(room);
    return;
  }

  const describer = room.players[room.turnIndex % room.players.length];
  const guesser = room.players[(room.turnIndex + 1) % room.players.length];
  const original = randomHexColor();

  const round: RoomInternal["currentRound"] = {
    id: nanoid(),
    index: room.roundIndex,
    describerPlayerId: describer.id,
    guesserPlayerId: guesser.id,
    createdAt: now(),
    originalColorHexPrivate: original,
  };

  room.currentRound = round;
  room.phase = "describe";
  room.status = "in_game";
  touch(room);
}

export function startGame(code: string, byPlayerId: string, roundsTotal?: number) {
  const room = getOrThrow(code);
  if (room.hostId !== byPlayerId) throw new Error("APENAS_HOST");
  if (roundsTotal && Number.isFinite(roundsTotal)) room.roundsTotal = Math.max(1, Math.floor(roundsTotal));

  room.players.forEach((p) => (p.scoreTotal = 0));
  room.history = [];
  room.roundIndex = 0;
  room.turnIndex = 0;
  startNextRound(room);
  return toPublic(room);
}

export function submitDescription(code: string, byPlayerId: string, description: string) {
  const room = getOrThrow(code);
  const round = room.currentRound;
  if (!round) throw new Error("SEM_RODADA");
  if (room.phase !== "describe") throw new Error("FASE_INVALIDA");
  if (round.describerPlayerId !== byPlayerId) throw new Error("FORA_DO_TURNO");
  const text = description.trim();
  if (!text) throw new Error("DESCRICAO_VAZIA");

  round.description = text;
  room.phase = "guess";
  touch(room);
  return toPublic(room);
}

export function submitGuess(code: string, byPlayerId: string, guessedHex: string) {
  const room = getOrThrow(code);
  const round = room.currentRound;
  if (!round) throw new Error("SEM_RODADA");
  if (room.phase !== "guess") throw new Error("FASE_INVALIDA");
  if (round.guesserPlayerId !== byPlayerId) throw new Error("FORA_DO_TURNO");
  if (!round.originalColorHexPrivate) throw new Error("COR_ORIGINAL_AUSENTE");

  const delta = deltaE2000(round.originalColorHexPrivate, guessedHex);
  const score = scoreFromDeltaE(delta);

  round.guessedColorHex = guessedHex.toUpperCase();
  round.deltaE = Math.round(delta * 100) / 100;
  round.score = score;
  round.originalColorHex = round.originalColorHexPrivate;

  const guesser = room.players.find((p) => p.id === byPlayerId);
  if (guesser) guesser.scoreTotal = Math.round((guesser.scoreTotal + score) * 100) / 100;

  room.phase = "result";
  touch(room);
  return toPublic(room);
}

export function nextRound(code: string, byPlayerId: string) {
  const room = getOrThrow(code);
  if (room.hostId !== byPlayerId) throw new Error("APENAS_HOST");
  if (room.phase !== "result") throw new Error("FASE_INVALIDA");
  if (room.currentRound) room.history.push(room.currentRound as any);

  room.roundIndex += 1;
  room.turnIndex += 1; // "cadeia": quem chutou vira o próximo descritor
  room.currentRound = undefined;
  startNextRound(room);
  return toPublic(room);
}

export function getRoomPublic(code: string) {
  const room = getOrThrow(code);
  return toPublic(room);
}

export function getSecretColorForDescriber(code: string, playerId: string) {
  const room = getOrThrow(code);
  const round = room.currentRound;
  if (!round) return null;
  if (round.describerPlayerId !== playerId) return null;
  return round.originalColorHexPrivate ?? null;
}

