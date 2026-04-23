# Color Match (Memória da Cor) — MVP

Jogo multiplayer em tempo real: **um jogador descreve uma cor**, o próximo **tenta recriar** com um color picker, e o sistema calcula a **nota (0 a 10)** usando **DeltaE (CIEDE2000/LAB)**.

## Como rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Como jogar (fluxo rápido)

- **Criar sala** na Home (vira host).
- Compartilhar o **código** ou o **link** com outros jogadores.
- No lobby, o host clica **Iniciar partida**.
- O descritor vê a cor secreta e envia uma descrição.
- O adivinhador vê só a descrição e envia um palpite.
- A tela mostra **cor original vs escolhida**, **DeltaE** e **nota 0..10**.
- O host avança em **Próxima rodada** até finalizar.

## Arquitetura do MVP

- **App Router (UI)**: `app/`
- **Realtime (Socket.IO)**: `pages/api/socket.ts`
- **Estado local**: Zustand (`lib/gameStore.ts`)
- **Persistência**: em memória (processo Node) via `server/roomStore.ts`
- **Score de cor**: `server/color.ts` com `colorjs.io` (DeltaE 2000)

> Nota: por ser **persistência em memória**, reiniciar o `npm run dev` apaga as salas/placares.

## Próximas melhorias sugeridas

- Persistência real: PostgreSQL + Prisma (Room/Player/Round) e replays
- Autoplay: timer para avançar rodada e mostrar resultados por X segundos
- Configurações do host: ordem manual, número de rodadas por pares, modo “corrente” vs “sempre host”
- Anti-cheat: ocultar cor do descritor no client (hoje ela chega via evento privado do socket)
- UI/UX: animações, confetes no vencedor, indicadores de proximidade (gradiente/barra)
- Escalabilidade: redis/pubsub e múltiplas instâncias do servidor
