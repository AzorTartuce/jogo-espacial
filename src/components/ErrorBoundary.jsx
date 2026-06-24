import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    console.error('[Resgate Espacial] Erro capturado:', error, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="screen gameover fade-in" style={{ justifyContent: 'center', minHeight: '70vh' }}>
          <div style={{ fontSize: '4rem' }}>💫</div>
          <h2>Algo deu errado</h2>
          <p style={{ color: '#b9c2e8', textAlign: 'center', maxWidth: 340 }}>
            Ocorreu um erro inesperado. Volte ao menu e tente novamente.
          </p>
          <button
            className="big-btn"
            onClick={() => {
              this.setState({ crashed: false });
              this.props.onReset?.();
            }}
          >
            ← Voltar ao Menu
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
