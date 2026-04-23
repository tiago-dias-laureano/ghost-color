import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export async function getSocket() {
  if (socket) return socket;

  const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL; // ex: https://seu-realtime.fly.dev
  const path = process.env.NEXT_PUBLIC_REALTIME_PATH ?? "/api/socket";

  // Se for same-origin (sem URL externa), inicializa o handler do Socket.IO via API route.
  if (!realtimeUrl) {
    await fetch(path);
  }

  socket = io(realtimeUrl ?? undefined, {
    path,
    // Não force websocket: em algumas plataformas (ex: Vercel serverless) isso falha.
    transports: ["polling", "websocket"],
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

