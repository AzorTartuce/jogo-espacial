// Cliente WebSocket: conecta no mesmo host que serviu a página
// (em dev, o Vite faz proxy de /ws para o servidor de salas).
export function createConnection() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  const ws = new WebSocket(proto + location.host + '/ws');
  const listeners = new Map();

  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    (listeners.get(msg.type) || []).forEach((fn) => fn(msg));
  };

  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('ws-error'));
  });

  ws.onclose = () => {
    (listeners.get('closed') || []).forEach((fn) => fn());
  };

  return {
    ready,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    send(obj) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
    relay(data) {
      this.send({ type: 'relay', data });
    },
    close() {
      ws.onclose = null;
      ws.close();
    },
  };
}
