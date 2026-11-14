// Test helpers: a fetch router and rendering a route tree in memory.
import type { MeResponse } from '@expensehub/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';

export type Handler = (init: RequestInit & { body?: string }) => { status: number; body: unknown };

export function json(status: number, body: unknown) {
  return { status, body };
}

export const unauthenticated = () =>
  json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });

/** Stubs global fetch with handlers keyed by "METHOD /api/v1/path" (query string ignored). */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const handler = handlers[key];
    if (!handler) return new Response('', { status: 404 });
    const { status, body } = handler(init as RequestInit & { body?: string });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function renderRoutes(routes: RouteObject[], initialPath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, client };
}

export function meFixture(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: {
      userId: 11,
      personId: 300000010011,
      personNumber: '1011',
      fullName: 'Ahmed Al-Subaie',
      email: 'ahmed.alsubaie@zpi-demo.test',
      businessUnit: 'IPP',
      jobName: 'Sales Engineer',
    },
    roles: [],
    capabilities: ['EMPLOYEE'],
    prerequisites: {
      ok: true,
      checks: [
        { code: 'ACTIVE_ASSIGNMENT', ok: true, message: 'Active', contact: null },
        { code: 'LINE_MANAGER', ok: true, message: 'Set', contact: null },
        { code: 'DEFAULT_ACCOUNT', ok: true, message: 'Set', contact: null },
        { code: 'PAYEE', ok: true, message: 'Ready', contact: null },
      ],
    },
    session: {
      expiresAt: '2026-10-18T07:00:00.000Z',
      absoluteExpiresAt: '2026-10-18T14:00:00.000Z',
    },
    dev: { quickLogin: true },
    ...overrides,
  };
}
