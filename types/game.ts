export type RoomStatus = "lobby" | "in_game" | "finished";
export type Phase = "lobby" | "describe" | "guess" | "result" | "finished";

export type Player = {
  id: string;
  name: string;
  scoreTotal: number;
  attempts?: number;
  connected: boolean;
};

export type Round = {
  id: string;
  index: number;
  describerPlayerId: string;
  guesserPlayerId: string;
  originalColorHex?: string; // só revelado na fase "result"
  description?: string;
  guessedColorHex?: string;
  deltaE?: number;
  score?: number; // 0..10 (com decimais)
  createdAt: number;
};

export type RoomPublicState = {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  phase: Phase;
  roundsTotal: number;
  roundIndex: number; // 0-based
  turnIndex: number; // índice do "descritor" na lista de players
  players: Player[];
  currentRound?: Round;
  history: Round[];
  updatedAt: number;
};

export type ClientIdentity = {
  playerId: string;
  roomCode: string;
  name: string;
  playerToken: string;
};

