import type { NextApiRequest, NextApiResponse } from "next";
import { Server as IOServer } from "socket.io";
import type { Socket } from "socket.io";
import {
  attachSocket,
  createRoom,
  getRoomPublic,
  getSecretColorForDescriber,
  joinRoom,
  markDisconnectedBySocket,
  nextRound,
  startGame,
  submitDescription,
  submitGuess,
} from "@/server/roomStore";

type NextApiResponseWithSocket = NextApiResponse & {
  socket: NextApiResponse["socket"] & {
    server: NextApiResponse["socket"]["server"] & {
      io?: IOServer;
    };
  };
};

function safeEmitRoom(io: IOServer, roomCode: string) {
  try {
    const room = getRoomPublic(roomCode);
    io.to(roomCode).emit("room:state", room);
  } catch {
    // sala pode ter sido removida no futuro; no MVP mantemos em memória sem GC
  }
}

function handleError(socket: Socket, err: unknown) {
  const message = err instanceof Error ? err.message : "ERRO_DESCONHECIDO";
  socket.emit("app:error", { message });
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
    });
    res.socket.server.io = io;

    io.on("connection", (socket) => {
      socket.on("room:create", ({ name, roundsTotal }: { name: string; roundsTotal?: number }, ack?: (v: any) => void) => {
        try {
          const { room, playerId } = createRoom(name, roundsTotal ?? 8);
          socket.data.roomCode = room.code;
          socket.data.playerId = playerId;
          socket.join(room.code);
          ack?.({ ok: true, room, playerId });
          safeEmitRoom(io, room.code);
        } catch (e) {
          handleError(socket, e);
          ack?.({ ok: false });
        }
      });

      socket.on(
        "room:join",
        (
          { code, name, playerId }: { code: string; name: string; playerId?: string },
          ack?: (v: any) => void,
        ) => {
          try {
            const joined = joinRoom(code, name, playerId);
            const roomCode = joined.room.code;
            socket.data.roomCode = roomCode;
            socket.data.playerId = joined.playerId;
            socket.join(roomCode);
            attachSocket(roomCode, joined.playerId, socket.id);
            ack?.({ ok: true, room: joined.room, playerId: joined.playerId });

            safeEmitRoom(io, roomCode);
            const secret = getSecretColorForDescriber(roomCode, joined.playerId);
            if (secret) socket.emit("round:secretColor", { hex: secret });
          } catch (e) {
            handleError(socket, e);
            ack?.({ ok: false });
          }
        },
      );

      socket.on("room:sync", ({ code }: { code: string }) => {
        safeEmitRoom(io, code);
        const pid = socket.data.playerId as string | undefined;
        if (pid) {
          const secret = getSecretColorForDescriber(code, pid);
          if (secret) socket.emit("round:secretColor", { hex: secret });
        }
      });

      socket.on("room:start", ({ code, playerId, roundsTotal }: { code: string; playerId: string; roundsTotal?: number }, ack?: (v: any) => void) => {
        try {
          startGame(code, playerId, roundsTotal);
          ack?.({ ok: true });
          safeEmitRoom(io, code);
          const secret = getSecretColorForDescriber(code, playerId);
          if (secret) socket.emit("round:secretColor", { hex: secret });
        } catch (e) {
          handleError(socket, e);
          ack?.({ ok: false });
        }
      });

      socket.on(
        "round:submitDescription",
        ({ code, playerId, description }: { code: string; playerId: string; description: string }, ack?: (v: any) => void) => {
          try {
            submitDescription(code, playerId, description);
            ack?.({ ok: true });
            safeEmitRoom(io, code);
          } catch (e) {
            handleError(socket, e);
            ack?.({ ok: false });
          }
        },
      );

      socket.on(
        "round:submitGuess",
        ({ code, playerId, guessedHex }: { code: string; playerId: string; guessedHex: string }, ack?: (v: any) => void) => {
          try {
            submitGuess(code, playerId, guessedHex);
            ack?.({ ok: true });
            safeEmitRoom(io, code);
          } catch (e) {
            handleError(socket, e);
            ack?.({ ok: false });
          }
        },
      );

      socket.on("round:next", ({ code, playerId }: { code: string; playerId: string }, ack?: (v: any) => void) => {
        try {
          nextRound(code, playerId);
          ack?.({ ok: true });
          safeEmitRoom(io, code);
          const secret = getSecretColorForDescriber(code, playerId);
          if (secret) socket.emit("round:secretColor", { hex: secret });
        } catch (e) {
          handleError(socket, e);
          ack?.({ ok: false });
        }
      });

      socket.on("disconnect", () => {
        const info = markDisconnectedBySocket(socket.id);
        if (info) safeEmitRoom(io, info.roomCode);
      });
    });
  }

  res.status(200).json({ ok: true });
}

