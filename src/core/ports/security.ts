import type { PasswordPolicyPurpose as PasswordPolicyPurposeContract } from '../../contracts/index.js'

export const PasswordPolicyPurpose = {
  SetPassword: 'set_password',
  ChangePassword: 'change_password',
  PasswordRecovery: 'password_recovery',
} as const

export type PasswordPolicyPurpose = PasswordPolicyPurposeContract
export type {
  PasswordHasher,
  PasswordPolicy,
  PasswordPolicyDecision,
  PasswordPolicyInput,
} from '../../contracts/index.js'
