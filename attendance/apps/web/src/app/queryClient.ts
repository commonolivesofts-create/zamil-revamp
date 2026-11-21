import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api';
import { ME_QUERY_KEY } from './session';

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // Session expired mid-use: re-run single sign-on (silent while the Zamil session lives).
      onError: (error, query) => {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          query.queryKey[0] !== ME_QUERY_KEY[0]
        ) {
          void client.invalidateQueries({ queryKey: ME_QUERY_KEY });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // No retry for client errors or an unreachable database (EBS without the VPN).
        retry: (count, error) =>
          !(error instanceof ApiError && (error.status < 500 || error.code === 'UNAVAILABLE')) &&
          count < 2,
      },
    },
  });
  return client;
}
