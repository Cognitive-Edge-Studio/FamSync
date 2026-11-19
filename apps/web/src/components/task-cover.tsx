import type { CoverTopic } from "@/lib/task-cover";
import { cn } from "@/lib/utils";

// Original flat illustrations drawn with the theme's soft tints, so they follow light and dark mode.
// Decorative only: the card title already says what the task is.
const tones: Record<CoverTopic, { bg: string; fg: string; soft: string }> = {
  trip: { bg: "fill-sky", fg: "fill-sky-foreground", soft: "fill-sky-foreground/15" },
  school: { bg: "fill-lavender", fg: "fill-lavender-foreground", soft: "fill-lavender-foreground/15" },
  health: { bg: "fill-rose", fg: "fill-rose-foreground", soft: "fill-rose-foreground/15" },
  home: { bg: "fill-sage", fg: "fill-sage-foreground", soft: "fill-sage-foreground/15" },
  garden: { bg: "fill-sage", fg: "fill-sage-foreground", soft: "fill-sage-foreground/15" },
  bills: { bg: "fill-peach", fg: "fill-peach-foreground", soft: "fill-peach-foreground/15" },
  celebration: { bg: "fill-peach", fg: "fill-peach-foreground", soft: "fill-peach-foreground/15" },
  activity: { bg: "fill-sky", fg: "fill-sky-foreground", soft: "fill-sky-foreground/15" },
  shopping: { bg: "fill-peach", fg: "fill-peach-foreground", soft: "fill-peach-foreground/15" },
};

function Scene({ topic, fg, soft }: { topic: CoverTopic; fg: string; soft: string }) {
  const light = "fill-panel";
  switch (topic) {
    case "trip":
      return <>
        <circle cx="250" cy="34" r="14" className={soft} />
        <path d="M0 120 L70 52 L112 88 L160 30 L230 102 L262 76 L320 120 Z" className={soft} />
        <path d="M110 120 L160 30 L210 120 Z" className={fg} opacity=".55" />
        <path d="M160 30 L146 56 L156 52 L164 60 L174 56 Z" className={light} />
        <path d="M30 120 L70 52 L104 120 Z" className={fg} opacity=".35" />
        <path d="M70 52 L60 70 L70 66 L80 72 Z" className={light} />
      </>;
    case "school":
      return <>
        <circle cx="62" cy="34" r="20" className={soft} />
        <rect x="116" y="38" width="88" height="62" rx="6" className={light} />
        <rect x="116" y="38" width="44" height="62" rx="6" className={fg} opacity=".55" />
        <rect x="160" y="38" width="44" height="62" rx="6" className={fg} opacity=".3" />
        <rect x="168" y="52" width="26" height="4" rx="2" className={light} />
        <rect x="168" y="62" width="20" height="4" rx="2" className={light} />
        <rect x="224" y="26" width="10" height="72" rx="3" transform="rotate(18 229 62)" className={fg} opacity=".7" />
        <path d="M240 92 l-6 16 l12 -12 z" transform="rotate(18 229 62)" className={fg} />
      </>;
    case "health":
      return <>
        <circle cx="262" cy="30" r="18" className={soft} />
        <circle cx="54" cy="92" r="26" className={soft} />
        <path d="M160 104 C120 80 112 60 124 46 C136 32 152 38 160 50 C168 38 184 32 196 46 C208 60 200 80 160 104 Z" className={fg} opacity=".55" />
        <rect x="153" y="52" width="14" height="38" rx="3" className={light} />
        <rect x="141" y="64" width="38" height="14" rx="3" className={light} />
      </>;
    case "home":
      return <>
        <circle cx="62" cy="32" r="16" className={soft} />
        <rect x="0" y="104" width="320" height="16" className={soft} />
        <path d="M110 64 L160 26 L210 64 Z" className={fg} opacity=".6" />
        <rect x="120" y="62" width="80" height="44" className={light} />
        <rect x="150" y="76" width="20" height="30" rx="2" className={fg} opacity=".45" />
        <rect x="128" y="72" width="14" height="12" rx="2" className={fg} opacity=".25" />
        <rect x="178" y="72" width="14" height="12" rx="2" className={fg} opacity=".25" />
      </>;
    case "garden":
      return <>
        <circle cx="258" cy="30" r="16" className={soft} />
        <path d="M128 78 h64 l-8 32 h-48 z" className={fg} opacity=".55" />
        <rect x="158" y="44" width="4" height="36" rx="2" className={fg} opacity=".6" />
        <ellipse cx="144" cy="52" rx="18" ry="9" transform="rotate(-28 144 52)" className={fg} opacity=".4" />
        <ellipse cx="178" cy="44" rx="18" ry="9" transform="rotate(24 178 44)" className={fg} opacity=".4" />
        <ellipse cx="160" cy="30" rx="8" ry="14" className={fg} opacity=".5" />
        <circle cx="72" cy="96" r="22" className={soft} />
      </>;
    case "bills":
      return <>
        <circle cx="60" cy="34" r="18" className={soft} />
        <path d="M128 20 h64 v86 l-8 -6 l-8 6 l-8 -6 l-8 6 l-8 -6 l-8 6 l-8 -6 l-8 6 z" className={light} />
        <rect x="138" y="34" width="44" height="5" rx="2.5" className={fg} opacity=".35" />
        <rect x="138" y="46" width="32" height="5" rx="2.5" className={fg} opacity=".25" />
        <rect x="138" y="58" width="38" height="5" rx="2.5" className={fg} opacity=".25" />
        <path d="M232 40 l-16 30 h12 l-6 26 l20 -34 h-12 l8 -22 z" className={fg} opacity=".6" />
      </>;
    case "celebration":
      return <>
        <circle cx="70" cy="30" r="5" className={fg} opacity=".4" />
        <circle cx="250" cy="24" r="6" className={fg} opacity=".3" />
        <circle cx="236" cy="96" r="4" className={fg} opacity=".4" />
        <rect x="118" y="70" width="84" height="38" rx="6" className={fg} opacity=".55" />
        <rect x="130" y="50" width="60" height="24" rx="6" className={light} />
        <path d="M118 84 q10 8 21 0 t21 0 t21 0 t21 0" className="fill-none stroke-panel" strokeWidth="4" />
        <rect x="157" y="32" width="6" height="20" rx="2" className={fg} opacity=".5" />
        <ellipse cx="160" cy="26" rx="4" ry="7" className={fg} />
      </>;
    case "activity":
      return <>
        <rect x="0" y="96" width="320" height="24" className={soft} />
        <circle cx="160" cy="62" r="32" className={light} />
        <path d="M160 46 l14 10 l-5 16 h-18 l-5 -16 z" className={fg} opacity=".6" />
        <path d="M160 30 v16 M174 56 l16 -6 M169 72 l10 14 M151 72 l-10 14 M146 56 l-16 -6" className="fill-none stroke-current text-foreground/20" strokeWidth="2" />
        <path d="M244 30 v40" className="stroke-current text-foreground/25" strokeWidth="3" />
        <ellipse cx="236" cy="72" rx="9" ry="7" className={fg} opacity=".5" />
        <path d="M244 30 q12 4 12 16" className="fill-none stroke-current text-foreground/25" strokeWidth="3" />
      </>;
    case "shopping":
      return <>
        <circle cx="64" cy="34" r="18" className={soft} />
        <path d="M122 50 h76 l-8 56 h-60 z" className={fg} opacity=".55" />
        <path d="M142 54 v-12 a18 18 0 0 1 36 0 v12" className="fill-none stroke-current text-foreground/30" strokeWidth="5" strokeLinecap="round" />
        <circle cx="146" cy="42" r="10" className={fg} opacity=".35" />
        <rect x="170" y="30" width="10" height="24" rx="3" className={fg} opacity=".4" />
      </>;
  }
}

export function TaskCover({ topic, className }: { topic: CoverTopic; className?: string }) {
  const tone = tones[topic];
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice"
      className={cn("block h-24 w-full overflow-hidden rounded-lg", className)} data-cover={topic}>
      <rect width="320" height="120" className={tone.bg} />
      <Scene topic={topic} fg={tone.fg} soft={tone.soft} />
    </svg>
  );
}
