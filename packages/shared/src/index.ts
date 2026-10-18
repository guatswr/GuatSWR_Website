import { z } from 'zod'
import { defaultPublicConfig } from './config.js'

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
  home_bg: z.string().default(defaultPublicConfig.home_bg),
  join_bg: z.string().default(defaultPublicConfig.join_bg),
  banner_text: z.string().default(defaultPublicConfig.banner_text),
  badge_image: z.string().default(defaultPublicConfig.badge_image),
  mascot_image: z.string().default(defaultPublicConfig.mascot_image),
  qq_qr_image: z.string().default(defaultPublicConfig.qq_qr_image),
  qq_group_number: z.string().default(defaultPublicConfig.qq_group_number),
  qq_join_url: z.string().default(defaultPublicConfig.qq_join_url),
  join_question: z.string().default(defaultPublicConfig.join_question),
  home_links: z.string().default(defaultPublicConfig.home_links),
})

export type LoginInput = z.infer<typeof loginSchema>
export type PublicSiteConfig = z.infer<typeof publicConfigSchema>
