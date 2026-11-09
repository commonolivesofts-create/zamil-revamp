import type { HealthResponse } from '@expensehub/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusPage } from './StatusPage';

const healthy: HealthResponse = {
  status: 'ok',
  db: 'ok',
  dataMode: 'memory',
  fusionMode: 'mock',
  notifyTransport: 'outbox',
  env: 'development',
  version: '0.1.0',
  time: '2026-10-18T09:00:00.000Z',
  uptimeSeconds: 192,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatusPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatusPage', () => {
  it('shows operational status and the D-33 run modes', async () => {
    const fetchMock = vi.fn(async () => json(healthy));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'All systems operational' }),
    ).toBeInTheDocument();
    expect(screen.getByText('In-memory store')).toBeInTheDocument();
    expect(screen.getByText('Mock fixtures')).toBeInTheDocument();
    expect(screen.getByText('Dev outbox')).toBeInTheDocument();
    expect(screen.getByText('Up for 3m 12s')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/health');
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('ExpenseHub');
  });

  it('shows an outage when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'API unreachable' })).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeEnabled();
  });

  it('treats a proxy error without an API body as an outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'API unreachable' })).toBeInTheDocument();
  });

  it('shows degraded status when the data store is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ...healthy, status: 'degraded', db: 'error' }, 503)),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Running with problems' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Not responding')).toBeInTheDocument();
  });
});
