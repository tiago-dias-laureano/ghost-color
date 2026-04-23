"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useGameStore } from "@/lib/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { gameCommand } from "@/lib/supabaseGameApi";

export default function Home() {
  const router = useRouter();
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState("8");
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicRooms, setPublicRooms] = useState<Array<{ code: string; playersCount: number; roundsTotal: number; createdAt: string }>>(
    [],
  );
  const [loadingRooms, setLoadingRooms] = useState(false);

  const suggestedName = useMemo(() => `Jogador ${nanoid(3).toUpperCase()}`, []);

  async function refreshRooms() {
    setLoadingRooms(true);
    try {
      const res = await gameCommand<{
        ok: true;
        rooms: Array<{ code: string; playersCount: number; roundsTotal: number; createdAt: string }>;
      }>({ type: "list_public_rooms" } as any);
      setPublicRooms(res.rooms ?? []);
    } catch {
      // silencioso
    } finally {
      setLoadingRooms(false);
    }
  }

  useEffect(() => {
    refreshRooms().catch(() => {});
  }, []);

  async function onCreate() {
    const playerName = (name || suggestedName).trim();
    const roundsTotal = Math.max(1, Math.min(30, parseInt(rounds || "8", 10) || 8));
    setBusy(true);
    try {
      const { roomCode } = await createRoom(playerName, roundsTotal, { isPublic, password: isPublic ? undefined : password });
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
      const { roomCode: joinedCode } = await joinRoom(roomCode, playerName, { password: joinPassword || undefined });
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
              src="/c24adf58-6069-4228-bdf5-1c4a2954a0fb.svg"
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
              <div className="space-y-2">
                <div className="text-sm font-medium">Visibilidade</div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant={isPublic ? "default" : "secondary"} onClick={() => setIsPublic(true)} disabled={busy}>
                    Pública
                  </Button>
                  <Button type="button" variant={!isPublic ? "default" : "secondary"} onClick={() => setIsPublic(false)} disabled={busy}>
                    Privada
                  </Button>
                </div>
                {!isPublic ? (
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha da sala (mín. 4)" type="password" />
                ) : (
                  <div className="text-xs text-muted-foreground">Salas públicas aparecem na listagem até a partida iniciar.</div>
                )}
              </div>
              <Button disabled={busy || (!isPublic && password.trim().length < 4)} className="w-full" onClick={onCreate}>
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
              <div className="space-y-2">
                <div className="text-sm font-medium">Senha (se for privada)</div>
                <Input value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="••••" type="password" />
              </div>
              <Button variant="secondary" disabled={busy} className="w-full" onClick={onJoin}>
                Entrar
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Salas públicas (aguardando início)</div>
            <Button variant="ghost" size="sm" disabled={loadingRooms} onClick={() => refreshRooms()}>
              Atualizar
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {publicRooms.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {loadingRooms ? "Carregando…" : "Nenhuma sala pública no lobby agora."}
                </CardContent>
              </Card>
            ) : null}
            {publicRooms.map((r) => (
              <Card key={r.code} className="transition-colors hover:bg-muted/20">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-semibold tracking-tight">{r.code}</div>
                      <Badge variant="secondary">{r.playersCount} jogadores</Badge>
                      <Badge variant="outline">{r.roundsTotal} rodadas</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">Lobby</div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCode(r.code);
                      toast.message("Código preenchido. Clique em Entrar.");
                    }}
                  >
                    Usar código
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Dica: abra em duas abas/janelas para simular 2 jogadores rapidamente.
        </div>
      </div>
    </div>
  );
}
