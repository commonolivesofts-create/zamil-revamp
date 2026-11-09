import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../../components/auth/RequireAuth';
import { json, meFixture, mockApi, renderRoutes, unauthenticated } from '../../test/render';
import { safeNext } from '../../lib/session';
import { LoginPage } from './LoginPage';

const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Outlet />,
        children: [
          { index: true, element: <p>Home page</p> },
          { path: 'reports', element: <p>Reports page</p> },
        ],
      },
    ],
  },
];

const devUsers = json(200, {
  password: 'ExpenseHub2026',
  users: [
    {
      personNumber: '1009',
      fullName: 'Yousef Al-Malki',
      persona: 'System Admin',
      scenario: 'Setup',
      businessUnit: 'IPP',
      jobName: 'IT',
    },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('validates before calling the API', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/auth/me': unauthenticated,
      'POST /api/v1/auth/sso': unauthenticated,
      'GET /api/v1/auth/dev-users': () => devUsers,
    });
    renderRoutes(routes, '/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your person number')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          init?.method === 'POST' &&
          new URL(String(input), 'http://localhost').pathname === '/api/v1/auth/login',
      ),
    ).toBe(false);
  });

  it('shows the API message when sign-in fails', async () => {
    mockApi({
      'GET /api/v1/auth/me': unauthenticated,
      'POST /api/v1/auth/sso': unauthenticated,
      'GET /api/v1/auth/dev-users': () => devUsers,
      'POST /api/v1/auth/login': () =>
        json(401, {
          error: { code: 'UNAUTHENTICATED', message: 'Invalid person number or password.' },
        }),
    });
    renderRoutes(routes, '/login');
    await userEvent.type(await screen.findByLabelText('Person number'), '1011');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid person number or password.',
    );
  });

  it('signs in with the CSRF header and goes to the page asked for', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/auth/me': unauthenticated,
      'POST /api/v1/auth/sso': unauthenticated,
      'GET /api/v1/auth/dev-users': () => devUsers,
      'POST /api/v1/auth/login': () => json(200, meFixture()),
    });
    renderRoutes(routes, '/login?next=%2Freports');
    await userEvent.type(await screen.findByLabelText('Person number'), '1011');
    await userEvent.type(screen.getByLabelText('Password'), 'ExpenseHub2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Reports page')).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls.find(
      ([input, request]) =>
        request?.method === 'POST' &&
        new URL(String(input), 'http://localhost').pathname === '/api/v1/auth/login',
    )!;
    expect(JSON.parse(String(init!.body))).toEqual({
      username: '1011',
      password: 'ExpenseHub2026',
    });
    expect(new Headers(init!.headers).get('X-Requested-With')).toBe('ExpenseHub');
  });

  it('uses an existing Zamil session without asking for a password', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/auth/me': unauthenticated,
      'POST /api/v1/auth/sso': () => json(200, meFixture()),
    });
    renderRoutes(routes, '/reports');
    expect(await screen.findByText('Reports page')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          init?.method === 'POST' &&
          new URL(String(input), 'http://localhost').pathname === '/api/v1/auth/sso',
      ),
    ).toBe(true);
  });

  it('offers dev quick sign-in in dev builds (D-33)', async () => {
    mockApi({
      'GET /api/v1/auth/me': unauthenticated,
      'POST /api/v1/auth/sso': unauthenticated,
      'GET /api/v1/auth/dev-users': () => devUsers,
      'POST /api/v1/auth/dev-login': () =>
        json(200, meFixture({ capabilities: ['EMPLOYEE', 'SYS_ADMIN'] })),
    });
    renderRoutes(routes, '/login');
    expect(await screen.findByText('ExpenseHub2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Yousef Al-Malki/ }));
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  it('sends a signed-out visitor to sign-in, remembering the page', async () => {
    mockApi({
      'GET /api/v1/auth/me': unauthenticated,
      'POST /api/v1/auth/sso': unauthenticated,
      'GET /api/v1/auth/dev-users': () => devUsers,
    });
    const { router } = renderRoutes(routes, '/reports');
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() => expect(router.state.location.search).toBe('?next=%2Freports'));
  });

  it('renders the page for a signed-in user', async () => {
    mockApi({ 'GET /api/v1/auth/me': () => json(200, meFixture()) });
    renderRoutes(routes, '/reports');
    expect(await screen.findByText('Reports page')).toBeInTheDocument();
  });
});

describe('safeNext (open-redirect guard)', () => {
  it.each([
    [null, '/'],
    ['/reports', '/reports'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
