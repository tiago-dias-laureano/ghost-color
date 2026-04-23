"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useGameStore } from "@/lib/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  const router = useRouter();
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState("8");
  const [busy, setBusy] = useState(false);

  const suggestedName = useMemo(() => `Jogador ${nanoid(3).toUpperCase()}`, []);

  async function onCreate() {
    const playerName = (name || suggestedName).trim();
    const roundsTotal = Math.max(1, Math.min(30, parseInt(rounds || "8", 10) || 8));
    setBusy(true);
    try {
      const { roomCode } = await createRoom(playerName, roundsTotal);
      router.push(`/room/${roomCode}`);
    } catch {
      toast.error("Não foi possível criar a sala.");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    const playerName = (name || suggestedName).trim();
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return toast.message("Digite o código da sala.");
    setBusy(true);
    try {
      const { roomCode: joinedCode } = await joinRoom(roomCode, playerName);
      router.push(`/room/${joinedCode}`);
    } catch {
      toast.error("Não foi possível entrar na sala.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-background to-muted/40 px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-8 space-y-2 text-center">
          <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-4">
            <Image
              src="/imagem_2026-04-23_155409097.png"
              alt="Logo do jogo"
              width={110}
              height={110}
              priority
              className="h-[88px] w-[88px] drop-shadow-sm md:h-[110px] md:w-[110px]"
            />
            <div className="text-left">
              <h1 className="text-4xl font-semibold tracking-tight">Ghost Color</h1>
              <div className="text-sm text-muted-foreground">Memória da Cor</div>
            </div>
          </div>
          <p className="text-muted-foreground">
            Um jogador descreve uma cor. O próximo tenta recriar. O resto é caos (em tempo real).
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Criar sala</CardTitle>
              <CardDescription>Você será o host e controla o início e as rodadas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Seu nome</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestedName} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Rodadas</div>
                <Input value={rounds} onChange={(e) => setRounds(e.target.value)} inputMode="numeric" />
              </div>
              <Button disabled={busy} className="w-full" onClick={onCreate}>
                Criar e entrar
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Entrar em sala</CardTitle>
              <CardDescription>Use o código (ou cole do link do host).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Seu nome</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestedName} />
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="text-sm font-medium">Código da sala</div>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCDE" />
              </div>
              <Button variant="secondary" disabled={busy} className="w-full" onClick={onJoin}>
                Entrar
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Dica: abra em duas abas/janelas para simular 2 jogadores rapidamente.
        </div>
      </div>
    </div>
  );
}
