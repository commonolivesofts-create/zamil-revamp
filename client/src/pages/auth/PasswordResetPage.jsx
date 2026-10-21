import PasswordLinkForm from '@/features/auth/PasswordLinkForm.jsx'

// Password reset opened from the e-mailed reset link (/password/reset#token=…).
export default function PasswordResetPage() {
  return <PasswordLinkForm kind="reset" />
}
