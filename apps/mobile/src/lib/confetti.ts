export type ConfettiPiece = { x: number; drift: number; rise: number; spin: number; size: number; shape: number; delay: number; time: number; color: string };
const colors = ['#58725f', '#e88c7d', '#ffd98a', '#8fb7e0', '#b9a0e7', '#8fc6a3'];

/** The same seed gives the same pieces, so a redraw does not scatter them again. */
export function confettiPieces(count: number, seed: number): ConfettiPiece[] {
  let state = (seed * 2654435761) >>> 0 || 1;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  return Array.from({ length: count }, (_, index) => ({
    x: next(), drift: (next() - 0.5) * 0.4, rise: 0.45 + next() * 0.45, spin: (next() - 0.5) * 1080, size: 7 + next() * 6, shape: next() > 0.35 ? 1.8 : 1,
    delay: Math.round(next() * 250), time: 1500 + Math.round(next() * 700), color: colors[index % colors.length],
  }));
}
