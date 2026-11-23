// All shifts for dropdowns (inactive included, as in CI3), cached and shared by every page.
import { useQuery } from '@tanstack/react-query';
import { shiftChoicesSchema } from '@attendance/shared';
import { api } from '../../lib/api';

export const SHIFT_CHOICES_KEY = 'shift-choices';

export function useShiftChoices() {
  return useQuery({
    queryKey: [SHIFT_CHOICES_KEY],
    queryFn: ({ signal }) => api('/shifts/choices', shiftChoicesSchema, { signal }),
    staleTime: 60_000,
  });
}
