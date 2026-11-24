import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AuditoriumLayout, Seat, SeatType } from '../api/types';

/** What the viewer sees: the server status, plus "Selected" for seats in this browser's cart. */
export type SeatViewStatus = 'Available' | 'Selected' | 'Held' | 'Sold';

export interface SeatView extends Omit<Seat, 'status'> {
  status: SeatViewStatus;
}

const STATUS_TEXT: Record<SeatViewStatus, string> = {
  Available: 'available',
  Selected: 'selected by you',
  Held: 'held by another customer',
  Sold: 'sold',
};

const TYPE_TEXT: Record<SeatType, string> = {
  Standard: '',
  Premium: 'premium',
  Accessible: 'wheelchair accessible',
};

export function seatLabel(seat: Pick<SeatView, 'row' | 'number' | 'seatType' | 'status'>): string {
  const type = TYPE_TEXT[seat.seatType];
  return `Row ${seat.row} seat ${seat.number}, ${type ? `${type}, ` : ''}${STATUS_TEXT[seat.status]}`;
}

const isSelectable = (seat: SeatView) => seat.status === 'Available' || seat.status === 'Selected';

function seatClasses(seat: SeatView, pending: boolean): string {
  const base =
    'relative flex h-8 w-8 items-center justify-center rounded-t-[0.7rem] rounded-b-md text-[0.6rem] font-bold transition-[transform,background-color,box-shadow] duration-150 sm:h-9 sm:w-9';
  const shape = seat.seatType === 'Premium' ? ' ring-1 ring-marquee-400/70' : '';
  const busy = pending ? ' animate-pulse motion-reduce:animate-none' : '';
  switch (seat.status) {
    case 'Selected':
      return `${base}${shape}${busy} bg-marquee-400 text-ink-950 shadow-[0_0_18px_-2px_rgba(251,191,58,0.75)] motion-safe:animate-seat-pop`;
    case 'Held':
      return `${base}${shape} seat-held-pattern cursor-not-allowed bg-ink-600 text-ink-300`;
    case 'Sold':
      return `${base}${shape} cursor-not-allowed bg-ink-800 text-ink-500`;
    default:
      return `${base}${shape}${busy} ${seat.seatType === 'Premium' ? 'bg-marquee-500/20 text-marquee-300 hover:bg-marquee-500/35' : seat.seatType === 'Accessible' ? 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/35' : 'bg-ink-600 text-ink-200 hover:bg-ink-500'} hover:-translate-y-0.5`;
  }
}

function SeatGlyph({ seat }: { seat: SeatView }) {
  if (seat.status === 'Sold') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (seat.status === 'Selected') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (seat.seatType === 'Accessible') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="currentColor">
        <circle cx="8" cy="2.6" r="1.6" />
        <path d="M6.5 5h2v3h3l1.8 4.2-1.4.6L10.4 10H6.5z" />
        <path d="M5.6 7.4A3.6 3.6 0 1 0 10 12.6l-.8-1.3a2.1 2.1 0 1 1-2.9-2.6z" />
      </svg>
    );
  }
  return <span aria-hidden>{seat.number}</span>;
}

interface SeatMapProps {
  layout: AuditoriumLayout;
  seats: SeatView[];
  /** Seats with a request in flight; clicks on them are ignored. */
  pendingSeatIds?: ReadonlySet<number>;
  /** When false, every seat is read-only (sales closed). */
  interactive?: boolean;
  onToggle: (seat: SeatView) => void;
}

/**
 * Accessible seat map. Every seat is a real button with a full text label, so the map works
 * with a keyboard and a screen reader, and status is shown by shape and icon as well as color.
 * Arrow keys move between seats (one seat is in the tab order at a time); Enter or Space
 * selects or releases the focused seat.
 */
export function SeatMap({ layout, seats, pendingSeatIds, interactive = true, onToggle }: SeatMapProps) {
  const rows = useMemo(() => {
    const byRow = new Map<string, SeatView[]>();
    for (const seat of seats) {
      const list = byRow.get(seat.row) ?? [];
      list.push(seat);
      byRow.set(seat.row, list);
    }
    return [...byRow.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([row, list]) => ({ row, seats: list.sort((a, b) => a.number - b.number) }));
  }, [seats]);

  const aisles = useMemo(() => new Set(layout.aisleAfter), [layout.aisleAfter]);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const firstSelectable = seats.find(isSelectable)?.id ?? seats[0]?.id ?? null;
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const activeId = focusedId !== null && seats.some((s) => s.id === focusedId) ? focusedId : firstSelectable;

  const moveFocus = (rowIndex: number, seatIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    const target = row.seats[Math.max(0, Math.min(seatIndex, row.seats.length - 1))];
    if (!target) return;
    setFocusedId(target.id);
    buttons.current.get(target.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, rowIndex: number, seatIndex: number) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => moveFocus(rowIndex, seatIndex + 1),
      ArrowLeft: () => moveFocus(rowIndex, seatIndex - 1),
      ArrowDown: () => moveFocus(Math.min(rowIndex + 1, rows.length - 1), seatIndex),
      ArrowUp: () => moveFocus(Math.max(rowIndex - 1, 0), seatIndex),
      Home: () => moveFocus(rowIndex, 0),
      End: () => moveFocus(rowIndex, Number.MAX_SAFE_INTEGER),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="w-full">
      <div className="relative mx-auto mb-10 max-w-xl" aria-hidden>
        <div className="h-3 rounded-[50%] bg-screen/80 blur-[1px] motion-safe:animate-screen-glow" />
        <div className="absolute inset-x-6 top-2 h-16 bg-gradient-to-b from-screen/20 to-transparent blur-xl" />
        <p className="mt-3 text-center text-[0.65rem] font-semibold tracking-[0.5em] text-ink-400 uppercase">Screen</p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div role="group" aria-label={`Seat map for ${layout.name}`} className="mx-auto flex w-max flex-col gap-2 px-2">
          {rows.map(({ row, seats: rowSeats }, rowIndex) => (
            <div key={row} role="group" aria-label={`Row ${row}`} className="flex items-center gap-1.5">
              <span className="w-5 text-center text-xs font-semibold text-ink-400" aria-hidden>
                {row}
              </span>
              {rowSeats.map((seat, seatIndex) => {
                const pending = pendingSeatIds?.has(seat.id) ?? false;
                const disabled = !interactive || !isSelectable(seat) || pending;
                return (
                  <div key={seat.id} className={`flex ${aisles.has(seat.number) ? 'mr-4 sm:mr-6' : ''}`}>
                    <button
                      ref={(el) => {
                        if (el) buttons.current.set(seat.id, el);
                        else buttons.current.delete(seat.id);
                      }}
                      type="button"
                      className={seatClasses(seat, pending)}
                      aria-label={seatLabel(seat)}
                      aria-pressed={seat.status === 'Selected'}
                      aria-disabled={disabled}
                      aria-busy={pending || undefined}
                      tabIndex={seat.id === activeId ? 0 : -1}
                      onFocus={() => setFocusedId(seat.id)}
                      onKeyDown={(e) => onKeyDown(e, rowIndex, seatIndex)}
                      onClick={() => {
                        if (!disabled) onToggle(seat);
                      }}
                    >
                      <SeatGlyph seat={seat} />
                    </button>
                  </div>
                );
              })}
              <span className="w-5 text-center text-xs font-semibold text-ink-400" aria-hidden>
                {row}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const LEGEND: { status: SeatViewStatus; seatType: SeatType; text: string }[] = [
  { status: 'Available', seatType: 'Standard', text: 'Available' },
  { status: 'Available', seatType: 'Premium', text: 'Premium' },
  { status: 'Available', seatType: 'Accessible', text: 'Wheelchair accessible' },
  { status: 'Selected', seatType: 'Standard', text: 'Your seat' },
  { status: 'Held', seatType: 'Standard', text: 'Held by someone else' },
  { status: 'Sold', seatType: 'Standard', text: 'Sold' },
];

export function SeatLegend({ premiumNote }: { premiumNote?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-300" aria-label="Seat legend">
      {LEGEND.map((item) => {
        const seat: SeatView = { id: 0, row: '', number: 1, label: '', seatType: item.seatType, status: item.status };
        return (
          <li key={item.text} className="flex items-center gap-2">
            <span className={`${seatClasses(seat, false).replace(/motion-safe:animate-seat-pop|hover:\S+/g, '')} pointer-events-none h-6! w-6!`} aria-hidden>
              {item.status === 'Available' && item.seatType !== 'Accessible' ? null : <SeatGlyph seat={seat} />}
            </span>
            <span>
              {item.text}
              {item.seatType === 'Premium' && premiumNote ? ` (${premiumNote})` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
