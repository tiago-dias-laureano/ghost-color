"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useGameStore, readPersistedIdentity } from "@/lib/gameStore";
import type { Player, RoomPublicState } from "@/types/game";
import { gameCommand } from "@/lib/supabaseGameApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

function ColorSwatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="h-24 w-full rounded-xl border" style={{ background: hex }} />
      <div className="text-xs text-muted-foreground">{hex}</div>
    </div>
  );
}

function sortedScoreboard(players: Player[]) {
  return [...players].sort((a, b) => b.scoreTotal - a.scoreTotal);
}

function getAttemptStats(room: RoomPublicState) {
  const scoredRounds = [
    ...room.history,
    ...(room.currentRound?.score != null ? [room.currentRound] : []),
  ].filter((r) => r.score != null);

  const byPlayerId = new Map<string, { attempts: number; sum: number; avg: number }>();
  for (const p of room.players) byPlayerId.set(p.id, { attempts: 0, sum: 0, avg: 0 });

  for (const r of scoredRounds) {
    const entry = byPlayerId.get(r.guesserPlayerId);
    if (!entry) continue;
    const s = r.score ?? 0;
    entry.attempts += 1;
    entry.sum = Math.round((entry.sum + s) * 100) / 100;
    entry.avg = entry.attempts ? Math.round((entry.sum / entry.attempts) * 100) / 100 : 0;
  }

  return byPlayerId;
}

function TurnBadge({ room }: { room: RoomPublicState }) {
  const r = room.currentRound;
  if (!r) return null;
  const describer = room.players.find((p) => p.id === r.describerPlayerId)?.name ?? "—";
  const guesser = room.players.find((p) => p.id === r.guesserPlayerId)?.name ?? "—";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="secondary">Rodada {room.roundIndex + 1}/{room.roundsTotal}</Badge>
      <Badge variant="outline">Descritor: {describer}</Badge>
      <Badge variant="outline">Adivinhador: {guesser}</Badge>
    </div>
  );
}

export default function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const room = useGameStore((s) => s.room);
  const identity = useGameStore((s) => s.identity);
  const secretColorHex = useGameStore((s) => s.secretColorHex);
  const connected = useGameStore((s) => s.connected);
  const lastError = useGameStore((s) => s.lastError);

  const setIdentity = useGameStore((s) => s.setIdentity);
  const connect = useGameStore((s) => s.connect);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const startGame = useGameStore((s) => s.startGame);
  const submitDescription = useGameStore((s) => s.submitDescription);
  const submitGuess = useGameStore((s) => s.submitGuess);
  const nextRound = useGameStore((s) => s.nextRound);
  const sync = useGameStore((s) => s.sync);

  const [name, setName] = useState("");
  const [rounds, setRounds] = useState("8");
  const [desc, setDesc] = useState("");
  const [guess, setGuess] = useState("#22C55E");
  const [joinPassword, setJoinPassword] = useState("");
  const [roomInfo, setRoomInfo] = useState<{ exists: boolean; isPublic?: boolean; playersCount?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const normalizedCode = useMemo(() => code.toUpperCase(), [code]);

  useEffect(() => {
    connect().catch(() => {});
  }, [connect]);

  useEffect(() => {
    // Descobrir se a sala é pública/privada antes de entrar (para pedir senha)
    (async () => {
      try {
        const res = await gameCommand<{ ok: true; exists: boolean; room?: { isPublic: boolean; playersCount: number } }>({
          type: "room_info",
          code: normalizedCode,
        } as any);
        setRoomInfo({ exists: res.exists, isPublic: res.room?.isPublic, playersCount: res.room?.playersCount });
      } catch {
        setRoomInfo(null);
      }
    })();
  }, [normalizedCode]);

  useEffect(() => {
    if (lastError) toast.error(lastError);
  }, [lastError]);

  useEffect(() => {
    const persisted = readPersistedIdentity();
    if (!identity && persisted?.roomCode?.toUpperCase() === normalizedCode) {
      setIdentity(persisted);
    }
  }, [identity, normalizedCode, setIdentity]);

  useEffect(() => {
    if (!identity) return;
    if (identity.roomCode.toUpperCase() !== normalizedCode) return;
    sync().catch(() => {});
  }, [identity, normalizedCode, sync, connected]);

  const myId = identity?.playerId ?? null;
  const isInThisRoom = identity?.roomCode?.toUpperCase() === normalizedCode;
  const current = room?.currentRound;
  const isHost = !!room && !!myId && room.hostId === myId;
  const isDescriber = !!room && !!myId && current?.describerPlayerId === myId && room.phase === "describe";
  const isGuesser = !!room && !!myId && current?.guesserPlayerId === myId && room.phase === "guess";

  async function onJoin() {
    const playerName = (name || "Jogador").trim();
    setBusy(true);
    try {
      await joinRoom(normalizedCode, playerName, { password: joinPassword || undefined });
    } catch {
      toast.error("Falha ao entrar na sala.");
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    setBusy(true);
    try {
      const roundsTotal = Math.max(1, Math.min(30, parseInt(rounds || "8", 10) || 8));
      await startGame(roundsTotal);
      setDesc("");
    } catch {
      toast.error("Falha ao iniciar.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitDescription() {
    setBusy(true);
    try {
      await submitDescription(desc);
      setDesc("");
    } catch {
      toast.error("Falha ao enviar descrição.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitGuess() {
    setBusy(true);
    try {
      await submitGuess(guess);
    } catch {
      toast.error("Falha ao enviar palpite.");
    } finally {
      setBusy(false);
    }
  }

  async function onNext() {
    setBusy(true);
    try {
      await nextRound();
    } catch {
      toast.error("Falha ao avançar.");
    } finally {
      setBusy(false);
    }
  }

  if (!isInThisRoom) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sala {normalizedCode}</CardTitle>
            <CardDescription>
              {roomInfo?.exists === false
                ? "Sala não encontrada."
                : roomInfo?.isPublic === false
                  ? "Sala privada: digite a senha para entrar."
                  : "Entre com seu nome para participar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            {roomInfo?.isPublic === false ? (
              <Input
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                placeholder="Senha da sala"
                type="password"
              />
            ) : null}
            <Button disabled={busy} className="w-full" onClick={onJoin}>
              Entrar na sala
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push("/")}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!room || room.code.toUpperCase() !== normalizedCode) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Conectando…</CardTitle>
            <CardDescription>Sincronizando o estado da sala.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={connected ? 70 : 20} />
            <div className="text-sm text-muted-foreground">Realtime: {connected ? "online" : "offline"}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = getAttemptStats(room);
  const leaderboard = sortedScoreboard(room.players).sort((a, b) => {
    if (b.scoreTotal !== a.scoreTotal) return b.scoreTotal - a.scoreTotal;
    const sa = stats.get(a.id)?.avg ?? 0;
    const sb = stats.get(b.id)?.avg ?? 0;
    return sb - sa;
  });
  const me = room.players.find((p) => p.id === myId);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Image
              src="/c24adf58-6069-4228-bdf5-1c4a2954a0fb.svg"
              alt="Logo do jogo"
              width={44}
              height={44}
              className="h-10 w-10 shrink-0"
            />
            <div>
              <div className="text-sm text-muted-foreground">Sala</div>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-semibold tracking-tight">{room.code}</div>
                <Badge className={cn(connected ? "bg-emerald-600" : "bg-zinc-500")}>{connected ? "online" : "offline"}</Badge>
                {isHost ? <Badge variant="secondary">host</Badge> : null}
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Você: <span className="font-medium text-foreground">{me?.name ?? "—"}</span>
          </div>
        </div>

        <Card className="w-full md:w-[360px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Placar</CardTitle>
            <CardDescription>Soma das notas + média por tentativa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaderboard.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn(!p.connected && "text-muted-foreground")}>{p.name}</span>
                  {!p.connected ? <Badge variant="outline">off</Badge> : null}
                </div>
                <div className="text-right">
                  <div className="tabular-nums font-medium">{p.scoreTotal.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    média {(stats.get(p.id)?.avg ?? 0).toFixed(2)} · {(stats.get(p.id)?.attempts ?? 0)} tent.
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Jogo</CardTitle>
            <CardDescription>
              <TurnBadge room={room} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {room.phase === "lobby" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Jogadores</div>
                  <div className="flex flex-wrap gap-2">
                    {room.players.map((p) => (
                      <Badge key={p.id} variant={p.id === room.hostId ? "default" : "secondary"}>
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Rodadas (host)</div>
                    <Input value={rounds} onChange={(e) => setRounds(e.target.value)} inputMode="numeric" disabled={!isHost || busy} />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full" disabled={!isHost || busy || room.players.length < 2} onClick={onStart}>
                      Iniciar partida
                    </Button>
                  </div>
                </div>
                {room.players.length < 2 ? (
                  <div className="text-sm text-muted-foreground">Precisa de pelo menos 2 jogadores.</div>
                ) : null}
              </div>
            ) : null}

            {room.phase === "describe" ? (
              isDescriber ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorSwatch hex={secretColorHex ?? "#000000"} label="Sua cor (secreta)" />
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Dica</div>
                      <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                        Descreva como se estivesse explicando para alguém que nunca viu a cor.
                      </div>
                    </div>
                  </div>
                  <Textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder='Ex: "vermelho McDonald’s", "azul mar", "verde mato"...'
                  />
                  <Button disabled={busy || !desc.trim()} onClick={onSubmitDescription}>
                    Enviar descrição
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-lg font-medium">Aguardando descrição…</div>
                  <div className="text-sm text-muted-foreground">Só o jogador da vez pode ver a cor original.</div>
                </div>
              )
            ) : null}

            {room.phase === "guess" ? (
              isGuesser ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Descrição recebida</div>
                    <div className="rounded-xl border bg-muted/30 p-4 text-base">{room.currentRound?.description}</div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Escolha sua cor</div>
                      <Input type="color" value={guess} onChange={(e) => setGuess(e.target.value)} className="h-12 p-2" />
                    </div>
                    <ColorSwatch hex={guess} label="Preview" />
                  </div>
                  <Button disabled={busy} onClick={onSubmitGuess}>
                    Enviar palpite
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-lg font-medium">Aguardando palpite…</div>
                  <div className="text-sm text-muted-foreground">O adivinhador está ajustando a cor.</div>
                </div>
              )
            ) : null}

            {room.phase === "result" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorSwatch hex={room.currentRound?.originalColorHex ?? "#000000"} label="Cor original" />
                  <ColorSwatch hex={room.currentRound?.guessedColorHex ?? "#000000"} label="Cor escolhida" />
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">Distância (DeltaE 2000)</div>
                      <div className="text-2xl font-semibold tabular-nums">{(room.currentRound?.deltaE ?? 0).toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Nota (0 a 10)</div>
                      <div className="text-3xl font-semibold tabular-nums">{(room.currentRound?.score ?? 0).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={Math.max(0, Math.min(100, ((room.currentRound?.score ?? 0) / 10) * 100))} />
                  </div>
                </div>
                {isHost ? (
                  <Button disabled={busy} onClick={onNext}>
                    Próxima rodada
                  </Button>
                ) : (
                  <div className="text-sm text-muted-foreground">Aguardando o host avançar…</div>
                )}
              </div>
            ) : null}

            {room.phase === "finished" ? (
              <div className="space-y-4">
                <div className="text-2xl font-semibold">Fim de jogo</div>
                <div className="text-sm text-muted-foreground">
                  Vencedor: <span className="font-medium text-foreground">{leaderboard[0]?.name ?? "—"}</span>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="text-sm font-medium">Histórico</div>
                  <div className="space-y-2">
                    {room.history.map((r) => (
                      <div key={r.id} className="rounded-xl border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-muted-foreground">Rodada {r.index + 1}</div>
                          <div className="tabular-nums font-medium">{(r.score ?? 0).toFixed(2)} pts</div>
                        </div>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded border" style={{ background: r.originalColorHex ?? "#000" }} />
                            <span className="text-muted-foreground">Original</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded border" style={{ background: r.guessedColorHex ?? "#000" }} />
                            <span className="text-muted-foreground">Escolhida</span>
                          </div>
                        </div>
                        {r.description ? <div className="mt-2 text-muted-foreground">“{r.description}”</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
                {isHost ? (
                  <Button disabled={busy} onClick={onStart}>
                    Jogar novamente
                  </Button>
                ) : (
                  <div className="text-sm text-muted-foreground">Aguardando o host iniciar uma nova partida…</div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Compartilhar</CardTitle>
            <CardDescription>Envie o link ou o código para amigos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input readOnly value={typeof window !== "undefined" ? window.location.href : ""} />
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : room.code);
                  toast.success("Copiado!");
                } catch {
                  toast.message("Não foi possível copiar automaticamente.");
                }
              }}
            >
              Copiar link
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setIdentity(null);
                router.push("/");
              }}
            >
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

