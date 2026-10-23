import { z } from 'zod'

// Frozen backend roles: `users.role` defaults to `admin`; only the seeded
// super user is `super_admin`. Unknown roles fail closed instead of granting.
export const AUTH_ROLES = ['admin', 'super_admin'] as const

export const authRoleSchema = z.enum(AUTH_ROLES)

export type AuthRole = z.infer<typeof authRoleSchema>

// Also consumed by backend-v1.ts. `twofa` is the
// optional *second password*, never a TOTP code.
export const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅允许字母、数字、下划线和连字符'),
  password: z.string().min(1, '密码不能为空').max(100),
  twofa: z.string().min(4, '二步密码至少 4 位').max(50).optional().nullable(),
})

export type LoginInput = z.infer<typeof loginSchema>

/* ------------------------------------------------------- login form schemas */

// Field schemas keep the *input* type a plain string so a Standard Schema form
// library's field value type stays `string`; normalization happens once, at
// submit, through `normalizeLoginFormValue`.

export const loginUsernameField = z.string().trim().min(1, '用户名不能为空').max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅允许字母、数字、下划线和连字符')

export const loginPasswordField = z.string().min(1, '密码不能为空').max(100)

// Optional second password (never TOTP): blank means "not provided"; a
// non-blank value is never trimmed.
export const loginTwofaField = z.string().max(50)
  .refine(value => value.trim() === '' || value.length >= 4, '二步密码至少 4 位')

export const loginFormSchema = z.object({
  username: loginUsernameField,
  password: loginPasswordField,
  twofa: loginTwofaField,
})

export type LoginFormValues = z.input<typeof loginFormSchema>

export function createLoginFormValues(): LoginFormValues {
  return { username: '', password: '', twofa: '' }
}

/**
 * Normalize raw form values into the frozen v1 login body: the username is
 * trimmed (as the backend does), the password is never trimmed or altered, and
 * a blank optional second password becomes absent rather than an empty string.
 */
export function normalizeLoginFormValue(values: LoginFormValues): LoginInput {
  const parsed = loginFormSchema.parse(values)
  const twofa = typeof parsed.twofa === 'string' && parsed.twofa.trim() === '' ? undefined : parsed.twofa
  if (twofa === undefined) {
    return { username: parsed.username, password: parsed.password }
  }
  return { username: parsed.username, password: parsed.password, twofa }
}

/** Only fields safe to expose to the browser and to keep in the BFF cookie. */
export const safeUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).max(50),
  role: authRoleSchema,
  avatar: z.string().max(500).nullable(),
})

export type SafeUser = z.infer<typeof safeUserSchema>

// The frozen backend stores `twofa_enabled` as a SQLite 0/1 integer, not a
// boolean, so normalize both shapes before the value reaches the browser.
const upstreamTwofaFlagSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform(value => value === true || value === 1)

/** Exact projection of backend `GET /api/auth/me`. */
export const upstreamMeSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).max(50),
  role: authRoleSchema,
  avatar: z.string().max(500).nullable().optional(),
  twofa_enabled: upstreamTwofaFlagSchema.optional(),
})

export type UpstreamMe = z.infer<typeof upstreamMeSchema>

// Shape of the frozen backend login response. The BFF consumes and discards
// `token`; it must never be returned to the browser.
export const loginResponseSchema = z.object({
  token: z.string().min(1).max(4096),
  username: z.string().min(1).max(50),
  role: authRoleSchema,
  avatar: z.string().max(500).nullable().optional(),
  id: z.number().int().positive(),
})

export type LoginResponse = z.infer<typeof loginResponseSchema>

/** Project the `/api/auth/me` row down to the public session shape. */
export function projectSafeUser(me: UpstreamMe): SafeUser {
  return {
    id: me.id,
    username: me.username,
    role: me.role,
    avatar: me.avatar ?? null,
  }
}

export function isAdminRole(role: AuthRole): boolean {
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdminRole(role: AuthRole): boolean {
  return role === 'super_admin'
}
