import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export async function getSocket() {
  if (socket) return socket;

  // inicializa o servidor Socket.IO (Next API route)
  await fetch("/api/socket");

  socket = io({
    path: "/api/socket",
    transports: ["websocket"],
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

