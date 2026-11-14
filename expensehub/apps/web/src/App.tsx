import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ME_KEY } from './features/auth/hooks';
import { ApiError } from './lib/api';
import { router } from './routes';

/** Any 401 means the session is gone (idle 30 min / 8 h): drop the user → back to sign-in. */
function onApiError(error: unknown) {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
    queryClient.setQueryData(ME_KEY, null);
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  // A failed sign-in also returns 401, but the user is already signed out then: harmless.
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Never retry client errors (401/403/404/409/422 …); retry network/server errors twice.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton theme="system" />
    </QueryClientProvider>
  );
}
