const RENDER_WSS_URL = 'wss://resgate-espacial.onrender.com/ws';

// Quantas vezes tentamos reconectar automaticamente antes de desistir.
const MAX_RECONNECT_ATTEMPTS = 5;

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

  const listeners = new Map();
  let ws;
  let manualClose = false;
  let reconnectInfo = null; // { code, playerIndex, token }
  let attempts = 0;

  function emit(type, msg) {
    (listeners.get(type) || []).forEach((fn) => fn(msg));
  }

  function wire(socket) {
    socket.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      // Reconexão aceita pelo servidor: zera o contador de tentativas.
      if (msg.type === 'reconnected') attempts = 0;
      emit(msg.type, msg);
    };
    socket.onclose = () => {
      if (manualClose) return;
      // Só tentamos reconectar se já sabemos o slot (code+token).
      if (reconnectInfo && attempts < MAX_RECONNECT_ATTEMPTS) {
        attempts++;
        emit('reconnecting', { attempt: attempts, max: MAX_RECONNECT_ATTEMPTS });
        setTimeout(() => {
          if (manualClose) return;
          ws = new WebSocket(wsUrl);
          wire(ws);
          ws.onopen = () => {
            try {
              ws.send(JSON.stringify({ type: 'reconnect', ...reconnectInfo }));
            } catch {
              // ignore
            }
          };
        }, Math.min(800 * attempts, 4000));
      } else {
        emit('closed');
      }
    };
  }

  ws = new WebSocket(wsUrl);
  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('ws-error'));
  });
  wire(ws);

  return {
    ready,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
    // `to` opcional: índice ou lista de índices que devem receber o relay.
    relay(data, to) {
      this.send({ type: 'relay', data, ...(to !== undefined ? { to } : {}) });
    },
    // Guarda os dados do slot para permitir reconexão automática após uma queda.
    setReconnect(info) {
      reconnectInfo = info;
      attempts = 0;
    },
    close() {
      manualClose = true;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    },
  };
}
