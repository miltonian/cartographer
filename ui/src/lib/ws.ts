type MessageHandler = (message: { type: string; data: unknown }) => void;

interface ConnectOptions {
  onMessage: MessageHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export interface WsController {
  close: () => void;
}

// A single managed connection. Reconnect REPLACES the internal socket (it does
// not spawn an untracked one), and `close()` sets a disposed flag that stops all
// further reconnects — so disconnects/unmounts can't accumulate orphaned sockets
// each running their own reconnect chain (the old reconnect-storm bug).
export function connectWebSocket(opts: ConnectOptions): WsController {
  const { onMessage, onConnect, onDisconnect } = opts;

  let disposed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingMessage: { type: string; data: unknown } | null = null;
  let attempts = 0;

  const connect = () => {
    if (disposed) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      attempts = 0;
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Snapshots (sent on connect) are delivered immediately; they supersede
        // any pending debounced reload.
        if (message.type === 'snapshot') {
          if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
          pendingMessage = null;
          onMessage(message);
          return;
        }
        // Model-change events are debounced — during analysis the agent writes
        // many entities quickly; batch them into one reload.
        pendingMessage = message;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (pendingMessage) { onMessage(pendingMessage); pendingMessage = null; }
          debounceTimer = null;
        }, 500);
      } catch {
        // Ignore malformed messages
      }
    };

    // Let onclose drive reconnection; don't force-close here (that doubled the
    // reconnect path). onclose always fires after onerror.
    ws.onerror = () => { /* handled by onclose */ };

    ws.onclose = () => {
      onDisconnect?.();
      if (disposed) return;
      const delay = Math.min(30000, 1000 * 2 ** attempts);
      attempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close: () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (ws) {
        // Detach handlers so the imminent close doesn't schedule a reconnect.
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    },
  };
}
