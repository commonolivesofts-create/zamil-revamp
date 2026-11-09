import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../../components/auth/RequireAuth';
import { json, meFixture, mockApi, renderRoutes, unauthenticated } from '../../test/render';
import { useLogout } from './hooks';

function SignOutButton() {
  const logout = useLogout();
  return (
    <button type="button" onClick={() => logout.mutate()}>
      Sign out
    </button>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('sign-out', () => {
  it('returns to sign-in without the "session ended" notice', async () => {
    let signedIn = true;
    mockApi({
      'GET /api/v1/auth/me': () => (signedIn ? json(200, meFixture()) : unauthenticated()),
      'POST /api/v1/auth/logout': () => {
        signedIn = false;
        return json(200, { ok: true });
      },
    });
    const { router } = renderRoutes(
      [
        { path: '/login', element: <p>Login page</p> },
        { element: <RequireAuth />, children: [{ index: true, element: <SignOutButton /> }] },
      ],
      '/',
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(router.state.location.search).not.toContain('expired');
  });
});
