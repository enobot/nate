import { useId, type ReactElement } from 'react';

/**
 * Poster art drawn with SVG from two keys stored on each movie (palette + motif).
 * All movies in this demo are fictional, so no real posters, studios, or logos are used.
 */

type Palette = { from: string; via: string; to: string; accent: string };

export const PALETTES: Record<string, Palette> = {
  ember: { from: '#2a0606', via: '#8a2410', to: '#f97316', accent: '#fde68a' },
  tide: { from: '#02121f', via: '#0e4f6e', to: '#22d3ee', accent: '#cffafe' },
  aurora: { from: '#03110c', via: '#0f5132', to: '#34d399', accent: '#ddd6fe' },
  dusk: { from: '#190822', via: '#7c2d55', to: '#fb7185', accent: '#fed7aa' },
  moss: { from: '#081408', via: '#3f6212', to: '#a3e635', accent: '#fef9c3' },
  violet: { from: '#0b0520', via: '#4c1d95', to: '#a78bfa', accent: '#f5d0fe' },
  gold: { from: '#160f02', via: '#92400e', to: '#fbbf24', accent: '#fff7ed' },
  frost: { from: '#070e1a', via: '#334155', to: '#cbd5e1', accent: '#e0f2fe' },
};

export const MOTIFS = ['orbit', 'waves', 'peaks', 'grid', 'rings', 'sun', 'beam', 'stars'] as const;

/** Small deterministic hash so each title gets its own star field. */
function seeded(title: string) {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function Motif({ motif, p, title }: { motif: string; p: Palette; title: string }): ReactElement {
  switch (motif) {
    case 'orbit':
      return (
        <g fill="none" stroke={p.accent} strokeOpacity="0.55">
          <ellipse cx="100" cy="120" rx="80" ry="26" transform="rotate(-18 100 120)" />
          <ellipse cx="100" cy="120" rx="56" ry="16" transform="rotate(-18 100 120)" strokeOpacity="0.35" />
          <circle cx="100" cy="120" r="24" fill={p.to} fillOpacity="0.85" stroke="none" />
          <circle cx="164" cy="98" r="6" fill={p.accent} stroke="none" />
        </g>
      );
    case 'waves':
      return (
        <g fill="none" strokeWidth="5" strokeLinecap="round">
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M-10 ${150 + i * 18} Q 25 ${135 + i * 18} 50 ${150 + i * 18} T 110 ${150 + i * 18} T 170 ${150 + i * 18} T 230 ${150 + i * 18}`}
              stroke={i % 2 ? p.accent : p.to}
              strokeOpacity={0.75 - i * 0.12}
            />
          ))}
          <circle cx="150" cy="80" r="18" fill={p.accent} fillOpacity="0.8" stroke="none" />
        </g>
      );
    case 'peaks':
      return (
        <g>
          <circle cx="135" cy="78" r="20" fill={p.accent} fillOpacity="0.85" />
          <polygon points="-10,220 60,110 120,220" fill={p.via} />
          <polygon points="50,220 125,95 210,220" fill={p.to} fillOpacity="0.8" />
          <polygon points="110,108 125,95 140,112 128,108" fill={p.accent} fillOpacity="0.7" />
        </g>
      );
    case 'grid':
      return (
        <g>
          <circle cx="100" cy="118" r="42" fill={p.to} fillOpacity="0.85" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="50" y={124 + i * 9} width="100" height={2 + i} fill={p.from} />
          ))}
          <g stroke={p.accent} strokeOpacity="0.45">
            {[...Array(7)].map((_, i) => (
              <line key={`h${i}`} x1="0" x2="200" y1={170 + i * i * 4} y2={170 + i * i * 4} />
            ))}
            {[...Array(11)].map((_, i) => (
              <line key={`v${i}`} x1={100} y1="170" x2={-150 + i * 50} y2="300" />
            ))}
          </g>
        </g>
      );
    case 'rings':
      return (
        <g fill="none" stroke={p.accent}>
          {[70, 56, 42, 28, 14].map((r, i) => (
            <circle key={r} cx="100" cy="125" r={r} strokeOpacity={0.2 + i * 0.15} strokeWidth={i === 2 ? 4 : 1.5} />
          ))}
          <line x1="100" y1="125" x2="100" y2="80" stroke={p.to} strokeWidth="3" />
          <line x1="100" y1="125" x2="128" y2="138" stroke={p.to} strokeWidth="3" />
        </g>
      );
    case 'sun':
      return (
        <g>
          <circle cx="100" cy="125" r="58" fill={p.to} />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="30" y={138 + i * 10} width="140" height={3 + i * 1.2} fill={p.via} />
          ))}
          <circle cx="100" cy="125" r="58" fill="none" stroke={p.accent} strokeOpacity="0.5" />
        </g>
      );
    case 'beam':
      return (
        <g>
          <polygon points="98,96 -20,40 -20,150" fill={p.accent} fillOpacity="0.22" />
          <rect x="92" y="96" width="14" height="94" fill={p.via} />
          <rect x="88" y="86" width="22" height="12" rx="3" fill={p.accent} />
          <rect x="0" y="188" width="200" height="40" fill={p.from} fillOpacity="0.7" />
          <path d="M0 192 Q 50 182 100 192 T 200 192" stroke={p.to} strokeOpacity="0.6" fill="none" strokeWidth="3" />
        </g>
      );
    default: {
      const rand = seeded(title);
      return (
        <g fill={p.accent}>
          {[...Array(42)].map((_, i) => (
            <circle key={i} cx={rand() * 200} cy={rand() * 200} r={rand() * 1.8 + 0.4} fillOpacity={0.4 + rand() * 0.6} />
          ))}
          <path d="M40 150 L 140 70" stroke={p.accent} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
          <circle cx="140" cy="70" r="6" fill={p.to} />
        </g>
      );
    }
  }
}

interface PosterArtProps {
  title: string;
  palette: string;
  motif: string;
  rating?: string;
  /** Show the title on the poster (off for tiny thumbnails). */
  showTitle?: boolean;
  className?: string;
  /** Posters are decorative when the title is printed nearby. */
  decorative?: boolean;
}

export function PosterArt({ title, palette, motif, rating, showTitle = true, className = '', decorative = true }: PosterArtProps) {
  const p = PALETTES[palette] ?? PALETTES.frost;
  // Unique per instance, and stripped to characters that are always safe inside url(#...).
  const gradientId = `poster-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/10 ${className}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Poster art for ${title}` })}
    >
      <svg viewBox="0 0 200 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.from} />
            <stop offset="65%" stopColor={p.via} />
            <stop offset="100%" stopColor={p.from} />
          </linearGradient>
        </defs>
        <rect width="200" height="300" fill={`url(#${gradientId})`} />
        <Motif motif={motif} p={p} title={title} />
        <rect y="190" width="200" height="110" fill={p.from} fillOpacity="0.55" />
      </svg>
      {rating && (
        <span className="absolute top-3 right-3 rounded-md border border-white/30 bg-black/40 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-white backdrop-blur-sm">
          {rating}
        </span>
      )}
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display text-xl leading-tight font-bold tracking-wide text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
            {title}
          </p>
        </div>
      )}
    </div>
  );
}
