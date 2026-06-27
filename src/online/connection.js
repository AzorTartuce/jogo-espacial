const RENDER_WSS_URL = 'wss://resgate-espacial.onrender.com/ws';

// Em Capacitor (app Android/iOS) location.protocol é 'capacitor:',
// então conecta direto no servidor Render em vez de usar o host relativo.
export function createConnection() {
  const isCapacitor = location.protocol === 'capacitor:';
  let wsUrl;
  if (isCapacitor) {
    wsUrl = RENDER_WSS_URL;
  } else {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    wsUrl = proto + location.host + '/ws';
  }
  const ws = new WebSocket(wsUrl);
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
