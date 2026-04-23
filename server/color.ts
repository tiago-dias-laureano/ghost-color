import Color from "colorjs.io";

export function normalizeHex(hex: string) {
  const v = hex.trim();
  if (!v) return "#000000";
  return v.startsWith("#") ? v : `#${v}`;
}

export function randomHexColor() {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`.toUpperCase();
}

export function deltaE2000(hexA: string, hexB: string) {
  const a = new Color(normalizeHex(hexA));
  const b = new Color(normalizeHex(hexB));
  // colorjs.io suporta DeltaE 2000 via deltaE("2000")
  return a.deltaE(b, "2000");
}

export function scoreFromDeltaE(deltaE: number) {
  // DeltaE ~0 é idêntico; acima de ~50 já é bem distante para o jogo.
  const MAX = 50;
  const clamped = Math.max(0, Math.min(MAX, deltaE));
  const score = 10 * (1 - clamped / MAX);
  // 2 casas decimais (ex: 9.60)
  return Math.round(score * 100) / 100;
}

