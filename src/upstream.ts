
import WebSocket from "ws";
import { config, SYMBOLS } from "./config";
import { normalizeMessage } from "./normalizer";
import type { Tick } from "./types";

export class UpstreamFeed {
  private socket?: WebSocket;
  private stopped = false;
  private retry = 0;
  private authTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly onTick: (tick: Tick) => void
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;

    if (this.authTimer) {
      clearTimeout(this.authTimer);
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.socket?.close(1000, "Server shutting down");
  }

  private connect(): void {
    if (this.stopped) return;

    if (
      !config.MARKET_API_KEY ||
      !config.MARKET_SECRET_KEY
    ) {
      console.error(
        "[feed] Missing API credentials. Check your .env file."
      );
      return;
    }

    console.log(
      `[feed] connecting to ${config.MARKET_WS_URL}`
    );

    let authenticated = false;
    let authRejected = false;

    const socket = new WebSocket(
      config.MARKET_WS_URL,
      {
        handshakeTimeout: 10000,
        perMessageDeflate: false
      }
    );

    this.socket = socket;

    socket.on("open", () => {
      console.log("[feed] WebSocket connected");

      const authPayload = {
        action: "auth",
        api_key: config.MARKET_API_KEY,
        secret: config.MARKET_SECRET_KEY
      };

      socket.send(JSON.stringify(authPayload));

      this.authTimer = setTimeout(() => {
        if (!authenticated && !authRejected) {
          console.error(
            "[feed] Authentication timed out"
          );

          socket.close(4002, "Authentication timeout");
        }
      }, 10000);
    });

    socket.on("message", (data) => {
      const raw = data.toString();

      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn(
          "[feed] Received a non-JSON message"
        );
        return;
      }

      if (!authenticated) {
        if (isAuthSuccess(parsed)) {
          authenticated = true;

          if (this.authTimer) {
            clearTimeout(this.authTimer);
          }

          this.retry = 0;

          console.log(
            "[feed] Authentication successful"
          );

          socket.send(
            JSON.stringify({
              action: "subscribeMarketPrice",
              symbols: [...SYMBOLS]
            })
          );

          console.log(
            `[feed] Subscription sent for ${SYMBOLS.length} symbols`
          );

          return;
        }

        if (isAuthFailure(parsed)) {
          authRejected = true;

          if (this.authTimer) {
            clearTimeout(this.authTimer);
          }

          console.error(
            "[feed] Authentication rejected:",
            safeMessage(parsed)
          );

          socket.close(4003, "Authentication rejected");
          return;
        }

        // Some providers send informational messages
        // before the authentication response.
        console.log(
          "[feed] Waiting for authentication response"
        );

        return;
      }

      const ticks = normalizeMessage(parsed);

      if (ticks.length > 0) {
        for (const tick of ticks) {
          this.onTick(tick);
        }
      } else if (!looksLikeControlMessage(parsed)) {
        console.debug(
          "[feed] Message received, but no price ticks were recognized"
        );
      }
    });

    socket.on("error", (error) => {
      console.error(
        "[feed] WebSocket error:",
        error.message
      );
    });

    socket.on("close", (code, reason) => {
      if (this.authTimer) {
        clearTimeout(this.authTimer);
      }

      console.warn(
        `[feed] Disconnected (${code}): ${reason.toString()}`
      );

      // Authentication errors require fixing credentials.
      // Retrying the same invalid credentials won't help.
      if (authRejected || code === 4003) {
        console.error(
          "[feed] Stopped reconnecting after authentication rejection."
        );
        return;
      }

      if (this.stopped) return;

      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const base = Math.min(
      config.RECONNECT_MAX_MS,
      config.RECONNECT_BASE_MS *
        2 ** Math.min(this.retry, 8)
    );

    const delay = Math.round(
      base * (0.8 + Math.random() * 0.4)
    );

    this.retry++;

    console.log(
      `[feed] Reconnecting in ${delay}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);

    this.reconnectTimer.unref();
  }
}

function isAuthSuccess(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;

  const status = String(
    v.status ?? v.type ?? v.event ?? v.action ?? ""
  ).toLowerCase();

  const message = String(
    v.message ?? ""
  ).toLowerCase();

  return (
    v.success === true ||
    v.authenticated === true ||
    [
      "authenticated",
      "auth_success",
      "authsuccess",
      "success"
    ].includes(status) ||
    message.includes("authenticated") ||
    message.includes("authentication successful")
  );
}

function isAuthFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;

  const status = String(
    v.status ?? v.type ?? v.event ?? ""
  ).toLowerCase();

  const message = String(
    v.message ?? v.error ?? v.reason ?? ""
  ).toLowerCase();

  return (
    v.success === false ||
    status.includes("error") ||
    status.includes("fail") ||
    status.includes("unauthorized") ||
    message.includes("unauthorized") ||
    message.includes("authentication failed") ||
    message.includes("invalid credentials")
  );
}

function safeMessage(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "Unknown provider response";
  }

  const v = value as Record<string, unknown>;

  return String(
    v.message ??
    v.error ??
    v.reason ??
    "Provider returned an authentication error"
  ).slice(0, 200);
}

function looksLikeControlMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;

  return (
    "status" in v ||
    "success" in v ||
    "message" in v ||
    "event" in v ||
    "type" in v
  );
}
