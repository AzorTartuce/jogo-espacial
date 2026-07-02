import { Component } from 'react';
import { tr } from '../i18n/index.jsx';

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
          <h2>{tr('error.crashed')}</h2>
          <p style={{ color: '#b9c2e8', textAlign: 'center', maxWidth: 340 }}>
            {tr('error.crashedDesc')}
          </p>
          <button
            className="big-btn"
            onClick={() => {
              this.setState({ crashed: false });
              this.props.onReset?.();
            }}
          >
            {tr('nav.backToMenu')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
