import PasswordLinkForm from '@/features/auth/PasswordLinkForm.jsx'

// First password for an account provisioned as PENDING, opened from the
// administrator-issued e-mail link (/password/setup#token=…). Not a registration page.
export default function PasswordSetupPage() {
  return <PasswordLinkForm kind="setup" />
}
