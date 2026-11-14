import type { RoleGrant } from '@expensehub/shared';
import { useTranslation } from 'react-i18next';

/** "Accountant · FPP (backup)", "Finance AP · all BUs". */
export function useRoleLabel() {
  const { t } = useTranslation();
  return (grant: RoleGrant) =>
    `${t(`roles.${grant.role}`)} · ${grant.businessUnit ?? t('common.allUnits')}${
      grant.isBackup ? ` (${t('common.backup')})` : ''
    }`;
}
