import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { ApiError } from './lib/api';
import { App } from './App';
import './theme/index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Training Hub failed to render', error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <main
          role="alert"
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: '#f4faf6',
            color: '#12352a',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <section
            style={{
              width: 'min(100%, 440px)',
              padding: 28,
              border: '1px solid #d5e8dc',
              borderRadius: 16,
              background: '#fff',
              boxShadow: '0 12px 36px rgb(18 53 42 / 8%)',
            }}
          >
            <p
              style={{
                margin: '0 0 8px',
                color: '#047857',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              Training Hub
            </p>
            <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>This page couldn’t load</h1>
            <p style={{ margin: '0 0 20px', color: '#5c766a', fontSize: 14, lineHeight: 1.5 }}>
              A page error interrupted the display. Reload to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                minHeight: 38,
                padding: '0 16px',
                border: 0,
                borderRadius: 9,
                background: '#047857',
                color: '#fff',
                font: 'inherit',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('th:unauthenticated', () => void qc.invalidateQueries({ queryKey: ['me'] }));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
        <Toaster position="bottom-right" richColors closeButton />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
