import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api/client';
import type { Cart, CartHold, ConcessionSelection, TicketSelection, TicketType } from '../api/types';
import { StorageKeys, readJson, removeKey, writeJson } from '../lib/storage';

/**
 * The cart's seats live on the server as seat holds (that is what reserves them for 10 minutes).
 * The browser only remembers the cart token and the customer's choices of ticket type and
 * snacks, which are priced by the server at quote and checkout time.
 */
interface StoredCart {
  token: string | null;
  ticketTypes: Record<number, TicketType>;
  concessions: Record<number, number>;
}

interface CartState extends StoredCart {
  screeningId: number | null;
  holds: CartHold[];
  expiresAtUtc: string | null;
  /** serverTime - browserTime, so the countdown matches the server's clock. */
  clockOffsetMs: number;
  synced: boolean;
}

export interface CartApi {
  token: string | null;
  screeningId: number | null;
  holds: CartHold[];
  expiresAtMs: number | null;
  clockOffsetMs: number;
  synced: boolean;
  ticketTypes: Record<number, TicketType>;
  concessions: Record<number, number>;
  holdSeat: (screeningId: number, seatId: number) => Promise<void>;
  releaseSeat: (seatId: number) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  setTicketType: (seatId: number, type: TicketType) => void;
  setConcessionQuantity: (itemId: number, quantity: number) => void;
  /** Ticket and snack selections in the shape the API expects. */
  selections: () => { tickets: TicketSelection[]; concessions: ConcessionSelection[] };
  /** Forget everything after a successful checkout. */
  reset: () => void;
}

const empty: CartState = {
  token: null,
  ticketTypes: {},
  concessions: {},
  screeningId: null,
  holds: [],
  expiresAtUtc: null,
  clockOffsetMs: 0,
  synced: false,
};

function loadInitial(): CartState {
  const stored = readJson<StoredCart>(StorageKeys.cart);
  if (!stored || typeof stored !== 'object') {
    return { ...empty, synced: true };
  }
  return {
    ...empty,
    token: typeof stored.token === 'string' ? stored.token : null,
    ticketTypes: stored.ticketTypes ?? {},
    concessions: stored.concessions ?? {},
    synced: !stored.token,
  };
}

function fromServer(state: CartState, cart: Cart): CartState {
  const seatIds = new Set(cart.holds.map((h) => h.seatId));
  const ticketTypes: Record<number, TicketType> = {};
  for (const id of seatIds) {
    ticketTypes[id] = state.ticketTypes[id] ?? 'Adult';
  }
  return {
    ...state,
    token: cart.cartToken,
    screeningId: cart.screeningId,
    holds: cart.holds,
    expiresAtUtc: cart.expiresAtUtc,
    clockOffsetMs: Date.parse(cart.serverTimeUtc) - Date.now(),
    ticketTypes,
    // Snacks only make sense with seats; an emptied cart starts fresh.
    concessions: cart.holds.length === 0 ? {} : state.concessions,
    synced: true,
  };
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(loadInitial);

  useEffect(() => {
    if (!state.token) {
      // No cart on the server, so there is nothing worth remembering.
      removeKey(StorageKeys.cart);
      return;
    }
    writeJson(StorageKeys.cart, { token: state.token, ticketTypes: state.ticketTypes, concessions: state.concessions });
  }, [state.token, state.ticketTypes, state.concessions]);

  const ensureToken = useCallback(async (): Promise<string> => {
    if (state.token) {
      return state.token;
    }
    const cart = await api.createCart();
    setState((s) => fromServer(s, cart));
    return cart.cartToken;
  }, [state.token]);

  const refresh = useCallback(async () => {
    const token = state.token;
    if (!token) {
      // Nothing is held on the server; a cart without a token starts out synced.
      return;
    }
    try {
      const cart = await api.cart(token);
      setState((s) => (s.token === token ? fromServer(s, cart) : s));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setState({ ...empty, synced: true });
        return;
      }
      setState((s) => ({ ...s, synced: true }));
    }
  }, [state.token]);

  // Restore held seats after a page refresh: ask the server what this cart token still holds.
  useEffect(() => {
    const token = state.token;
    if (state.synced || !token) {
      return;
    }
    let cancelled = false;
    api.cart(token).then(
      (cart) => {
        if (!cancelled) setState((s) => (s.token === token ? fromServer(s, cart) : s));
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ ...empty, synced: true });
        } else {
          setState((s) => ({ ...s, synced: true }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state.synced, state.token]);

  const holdSeat = useCallback(
    async (screeningId: number, seatId: number) => {
      let token = await ensureToken();
      let cart: Cart;
      try {
        cart = await api.holdSeat(token, screeningId, seatId);
      } catch (error) {
        // The stored token is unknown to the server (for example after a database reset): start over once.
        if (error instanceof ApiError && error.status === 404 && error.message.startsWith('Cart not found')) {
          const fresh = await api.createCart();
          token = fresh.cartToken;
          cart = await api.holdSeat(token, screeningId, seatId);
        } else {
          throw error;
        }
      }
      setState((s) => fromServer({ ...s, token }, cart));
    },
    [ensureToken],
  );

  const releaseSeat = useCallback(
    async (seatId: number) => {
      if (!state.token) return;
      const cart = await api.releaseSeat(state.token, seatId);
      setState((s) => fromServer(s, cart));
    },
    [state.token],
  );

  const clear = useCallback(async () => {
    const token = state.token;
    if (token) {
      await api.clearCart(token);
    }
    setState({ ...empty, synced: true });
  }, [state.token]);

  const reset = useCallback(() => {
    removeKey(StorageKeys.cart);
    setState({ ...empty, synced: true });
  }, []);

  const setTicketType = useCallback(
    (seatId: number, type: TicketType) => setState((s) => ({ ...s, ticketTypes: { ...s.ticketTypes, [seatId]: type } })),
    [],
  );

  const setConcessionQuantity = useCallback(
    (itemId: number, quantity: number) =>
      setState((s) => {
        const next = { ...s.concessions };
        if (quantity <= 0) {
          delete next[itemId];
        } else {
          next[itemId] = quantity;
        }
        return { ...s, concessions: next };
      }),
    [],
  );

  const selections = useCallback(
    () => ({
      tickets: state.holds.map((h) => ({ seatId: h.seatId, ticketType: state.ticketTypes[h.seatId] ?? 'Adult' })),
      concessions: Object.entries(state.concessions)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({ itemId: Number(itemId), quantity })),
    }),
    [state.holds, state.ticketTypes, state.concessions],
  );

  const value = useMemo<CartApi>(
    () => ({
      token: state.token,
      screeningId: state.screeningId,
      holds: state.holds,
      expiresAtMs: state.expiresAtUtc ? Date.parse(state.expiresAtUtc) : null,
      clockOffsetMs: state.clockOffsetMs,
      synced: state.synced,
      ticketTypes: state.ticketTypes,
      concessions: state.concessions,
      holdSeat,
      releaseSeat,
      clear,
      refresh,
      setTicketType,
      setConcessionQuantity,
      selections,
      reset,
    }),
    [state, holdSeat, releaseSeat, clear, refresh, setTicketType, setConcessionQuantity, selections, reset],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}

/** Milliseconds left on the cart's hold, using the server clock offset. */
export function remainingMs(cart: Pick<CartApi, 'expiresAtMs' | 'clockOffsetMs'>, now: number): number | null {
  return cart.expiresAtMs === null ? null : cart.expiresAtMs - (now + cart.clockOffsetMs);
}
