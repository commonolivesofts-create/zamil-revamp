// Runs a create/update/delete, shows the API's message as a toast and refreshes the lists
// that depend on it.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { MutationResult } from '@attendance/shared';
import { useToast } from '../components/toastContext';

export function useSave(queryKeys: readonly string[]) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const keys = queryKeys.join('|');
  return useCallback(
    async (action: () => Promise<MutationResult>) => {
      const result = await action();
      toast.success(result.message);
      await Promise.all(
        keys.split('|').map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      return result;
    },
    [queryClient, toast, keys],
  );
}
