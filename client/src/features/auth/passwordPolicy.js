// Client-side checks against the live backend password policy (GET
// /auth/password/policy). They mirror server/src/modules/auth/password.js so
// feedback matches the server, but the backend remains authoritative: a
// PASSWORD_POLICY_VIOLATION response is always shown. Passwords are checked
// and submitted exactly as typed (never trimmed or normalised).

const UPPERCASE = /\p{Lu}/u
const LOWERCASE = /\p{Ll}/u
const DIGIT = /\p{Nd}/u
// Anything that is not a letter or number, including spaces and punctuation.
const SPECIAL = /[^\p{L}\p{N}]/u

// Lengths are counted in Unicode code points, as on the server.
export const passwordLength = (password) => [...password].length

// Rule codes are the backend's PASSWORD_POLICY_VIOLATION detail messages.
export function policyRules(policy) {
  const rules = [
    { code: 'MIN_LENGTH', label: `At least ${policy.minLength} characters`, met: (p) => passwordLength(p) >= policy.minLength },
    { code: 'MAX_LENGTH', label: `No more than ${policy.maxLength} characters`, met: (p) => passwordLength(p) <= policy.maxLength },
  ]
  if (policy.requireUppercase) rules.push({ code: 'UPPERCASE', label: 'An uppercase letter', met: (p) => UPPERCASE.test(p) })
  if (policy.requireLowercase) rules.push({ code: 'LOWERCASE', label: 'A lowercase letter', met: (p) => LOWERCASE.test(p) })
  if (policy.requireDigit) rules.push({ code: 'DIGIT', label: 'A number', met: (p) => DIGIT.test(p) })
  if (policy.requireSpecialCharacter) {
    rules.push({ code: 'SPECIAL_CHARACTER', label: 'A symbol or space (not a letter or number)', met: (p) => SPECIAL.test(p) })
  }
  return rules
}

// Unmet rule codes; empty when the password satisfies the policy locally.
export function unmetPolicyRules(password, policy) {
  return policyRules(policy).filter((rule) => !rule.met(password)).map((rule) => rule.code)
}

const ruleText = {
  MIN_LENGTH: 'it is too short',
  MAX_LENGTH: 'it is too long',
  UPPERCASE: 'it needs an uppercase letter',
  LOWERCASE: 'it needs a lowercase letter',
  DIGIT: 'it needs a number',
  SPECIAL_CHARACTER: 'it needs a symbol or space',
}

// Field feedback for local or backend rule failures (unknown codes are ignored).
export function describeUnmetRules(codes) {
  const parts = codes.map((code) => ruleText[code]).filter(Boolean)
  return parts.length
    ? `The password does not meet the policy: ${parts.join(', ')}.`
    : 'The password does not meet the password policy.'
}

// Validation for a new password and its confirmation. Returns field errors
// keyed by `newPassword` / `confirmPassword` (empty when valid).
export function validateNewPassword({ newPassword, confirmPassword }, policy) {
  const errors = {}
  if (!newPassword) errors.newPassword = 'Enter a new password.'
  else {
    const unmet = unmetPolicyRules(newPassword, policy)
    if (unmet.length) errors.newPassword = describeUnmetRules(unmet)
  }
  if (!confirmPassword) errors.confirmPassword = 'Confirm the new password.'
  else if (newPassword && confirmPassword !== newPassword) errors.confirmPassword = 'The passwords do not match.'
  return errors
}

// Backend PASSWORD_POLICY_VIOLATION details: [{ field, message: <rule code> }].
export const violatedRules = (error) => (error?.details ?? []).map((detail) => detail.message)
