// Banner de rede (problema 1): oponente/jogador caído ou eu tentando reconectar.
// Compartilhado por OnlineGame (1v1) e TeamGame (2v2) — cada um passa seus
// próprios textos já traduzidos (namespaces `online.*` / `team.*` diferentes).
export default function NetBanner({ reconnecting, oppDisconnected, reconnectingText, disconnectedText }) {
  if (!reconnecting && !oppDisconnected) return null;
  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '8px 12px', textAlign: 'center', fontWeight: 600,
        background: reconnecting ? '#8a5a00' : '#664200', color: '#fff',
      }}
    >
      {reconnecting ? reconnectingText : disconnectedText}
    </div>
  );
}
