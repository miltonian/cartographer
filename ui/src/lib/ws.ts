type MessageHandler = (message: { type: string; data: unknown }) => void;

export function connectWebSocket(onMessage: MessageHandler): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;

  const ws = new WebSocket(url);

  // Debounce rapid model-change events (entity:added, relationship:added, etc.)
  // During analysis, the agent writes 50+ entities quickly — no need to reload after each one.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingMessage: { type: string; data: unknown } | null = null;

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      // Snapshot messages (sent on connect) are delivered immediately
      if (message.type === 'snapshot') {
        onMessage(message);
        return;
      }

      // Model change events are debounced — batch rapid writes into one reload
      pendingMessage = message;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (pendingMessage) {
          onMessage(pendingMessage);
          pendingMessage = null;
        }
        debounceTimer = null;
      }, 500);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    // Reconnect with backoff
    setTimeout(() => connectWebSocket(onMessage), 3000);
  };

  ws.onerror = () => {
    ws.close();
  };

  return ws;
}
