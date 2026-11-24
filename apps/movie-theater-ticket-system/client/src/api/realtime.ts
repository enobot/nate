import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { SeatsChangedMessage } from './types';

/**
 * A thin wrapper around the SignalR connection to /hubs/seats. Components depend on this
 * interface, so tests can swap in a fake feed without a server.
 */
export interface SeatFeed {
  start(): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
  join(screeningId: number): Promise<void>;
  leave(screeningId: number): Promise<void>;
  onSeatsChanged(handler: (message: SeatsChangedMessage) => void): void;
  onReconnecting(handler: () => void): void;
  onReconnected(handler: () => void): void;
  onClose(handler: () => void): void;
}

export function createSeatFeed(): SeatFeed {
  // SignalR picks the best transport (WebSockets, then Server-Sent Events, then long polling)
  // and retries automatically after a dropped connection.
  const connection = new HubConnectionBuilder()
    .withUrl('/hubs/seats')
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();

  return {
    start: () => connection.start(),
    stop: () => connection.stop(),
    isConnected: () => connection.state === HubConnectionState.Connected,
    join: (screeningId) => connection.invoke('JoinScreening', screeningId),
    leave: (screeningId) => connection.invoke('LeaveScreening', screeningId),
    onSeatsChanged: (handler) => connection.on('SeatsChanged', handler),
    onReconnecting: (handler) => connection.onreconnecting(() => handler()),
    onReconnected: (handler) => connection.onreconnected(() => handler()),
    onClose: (handler) => connection.onclose(() => handler()),
  };
}
