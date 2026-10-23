import { z } from 'zod'
import { defaultPublicConfig } from './config.js'

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

export type PublicSiteConfig = z.infer<typeof publicConfigSchema>

// Public read DTOs and frozen v1 row shapes for the BFF and type-only UI use.
export * from './public.js'
export * from './events.js'

// Auth/session and admin/protected contracts. `loginSchema` and `LoginInput`
// used to be declared in this file as well; they now live only in `auth.js`.
export * from './auth.js'
export * from './admin.js'
export * from './guest-proof.js'
export * from './guest-content.js'
