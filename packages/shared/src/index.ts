import { z } from 'zod'

// Mirrors backend/src/controllers/schemas.js; the frozen backend is not a
// workspace consumer yet. Contract parity is tested before changing either side.
export const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅允许字母、数字、下划线和连字符'),
  password: z.string().min(1, '密码不能为空').max(100),
  twofa: z.string().min(4, '二步密码至少 4 位').max(50).optional().nullable(),
})

// Explicit projection avoids ever serializing private configuration into SSR.
export const publicConfigSchema = z.object({
  home_bg: z.string().default(''),
  join_bg: z.string().default(''),
  banner_text: z.string().default(''),
  badge_image: z.string().default(''),
  mascot_image: z.string().default(''),
  qq_qr_image: z.string().default(''),
  qq_group_number: z.string().default(''),
  qq_join_url: z.string().default(''),
  join_question: z.string().default('你是怎么入坑东方的？'),
  home_links: z.string().default(''),
})

export type LoginInput = z.infer<typeof loginSchema>
export type PublicSiteConfig = z.infer<typeof publicConfigSchema>
