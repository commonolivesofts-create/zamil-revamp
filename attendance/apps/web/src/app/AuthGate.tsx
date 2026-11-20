// Renders the app only for a signed-in employee; otherwise signs in through Zamil or explains why
// it cannot.
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { PageState } from '../components/Feedback';
import { errorMessage } from '../lib/api';
import { redirectToZamilLogin } from '../lib/zamil-login';
import { isNotLinked, ME_QUERY_KEY, MeContext, needsZamilLogin, signInWithZamil } from './session';

export function AuthGate({ children }: { children: ReactNode }) {
  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => signInWithZamil(signal),
    retry: false,
    staleTime: Infinity,
  });

  if (me.isPending) {
    return (
      <PageState kind="loading" title="Signing you in" description="Checking your Zamil session…" />
    );
  }
  if (me.isError) {
    if (needsZamilLogin(me.error)) return <RedirectToZamil />;
    return (
      <PageState
        kind="error"
        title={isNotLinked(me.error) ? 'No attendance profile' : 'Sign-in could not be completed'}
        description={errorMessage(me.error)}
        actionLabel="Try again"
        onAction={() => void me.refetch()}
      />
    );
  }
  return <MeContext.Provider value={me.data}>{children}</MeContext.Provider>;
}

function RedirectToZamil() {
  useEffect(() => redirectToZamilLogin(), []);
  return (
    <PageState
      kind="loading"
      title="Redirecting to Zamil Digitalization"
      description="Sign in to Zamil, then open the Attendance System again."
    />
  );
}
