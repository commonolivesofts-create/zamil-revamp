// UI-UX §6 StatusPill — one colour per status (lib/report-status), icon + text (§8).
import type { ReportStatus } from '@expensehub/shared';
import { useTranslation } from 'react-i18next';
import { STATUS_TONE } from '../../lib/report-status';
import { Tag } from './Tag';

export function StatusPill({ status, className }: { status: ReportStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <Tag tone={STATUS_TONE[status]} className={className}>
      {t(`reports.status.${status}`)}
    </Tag>
  );
}
