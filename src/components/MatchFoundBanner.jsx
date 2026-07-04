// Problema 2 (OnlineGame): pareamento chegou logo após o jogador ter cancelado
// a busca rápida — avisa com uma mensagem transitória em vez de puxar o
// jogador de volta sem explicação.
export default function MatchFoundBanner({ show, text }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '8px 12px', textAlign: 'center', fontWeight: 600,
        background: '#1d5b8a', color: '#fff',
      }}
    >
      {text}
    </div>
  );
}
