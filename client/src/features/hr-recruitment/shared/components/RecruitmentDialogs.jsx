import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { COMMON_TEXT } from '../../hrRecruitmentText.js'

// Confirmation before leaving a form (a new blank form, its report, Home)
// clears unsaved answers.
export function NewFormDialog({ onConfirm, onClose }) {
  return (
    <ConfirmDialog title={COMMON_TEXT.newFormTitle} description={COMMON_TEXT.newFormBody} confirmLabel={COMMON_TEXT.newFormConfirm}
      pending={false} onConfirm={onConfirm} onClose={onClose} />
  )
}
