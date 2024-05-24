import events from 'events';

declare module 'net-ping' {
  export enum NetworkProtocol {
    IPv4 = 1,
    IPv6 = 2,
  }

  export interface PingOptions {
    retries?: number;
    timeout?: number;
    packetSize?: number;
    networkProtocol?: NetworkProtocol;
    _debug?: boolean; // Internal debug option
    ttl?: number;
    sessionId?: number;
  }

  export interface PingResponse {
    alive: boolean;
    time?: number;
    min?: number;
    max?: number;
    avg?: number;
    stddev?: number;
  }

  export class Session extends events.EventEmitter {
    constructor(options?: PingOptions);
    close(): this;
    pingHost(target: string, callback: (error: Error | null, target: string, sent: Date, rcvd: Date) => void): this;
    traceRoute(target: string, ttlOrOptions: number | PingOptions, feedCallback: (error: Error | null, target: string, ttl: number, sent: Date, rcvd: Date) => boolean, doneCallback: (error: Error | null, target: string) => void): this;
  }

  export function createSession(options?: PingOptions): Session;

  // Error classes
  export class DestinationUnreachableError extends Error {
    source: string;
  }
  export class PacketTooBigError extends Error {
    source: string;
  }
  export class ParameterProblemError extends Error {
    source: string;
  }
  export class RedirectReceivedError extends Error {
    source: string;
  }
  export class RequestTimedOutError extends Error {
    // No additional properties
  }
  export class SourceQuenchError extends Error {
    source: string;
  }
  export class TimeExceededError extends Error {
    source: string;
  }
}
