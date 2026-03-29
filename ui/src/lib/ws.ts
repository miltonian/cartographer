type MessageHandler = (message: { type: string; data: unknown }) => void;

export function connectWebSocket(onMessage: MessageHandler): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;

  const ws = new WebSocket(url);

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      onMessage(message);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    // Reconnect after 2 seconds
    setTimeout(() => connectWebSocket(onMessage), 2000);
  };

  ws.onerror = () => {
    ws.close();
  };

  return ws;
}
