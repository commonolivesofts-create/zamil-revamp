import { can } from '@attendance/shared';
import { useMe } from '../../app/session';

/** HR admins change setup data; everyone else sees it read-only. */
export function useCanManage(): boolean {
  return can(useMe().roles, 'setup:manage');
}
