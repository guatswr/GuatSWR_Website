// Type augmentations for the BFF session and the admin route meta.
//
// They live in `shared/` rather than `types/` because Nuxt's generated
// tsconfigs include `shared/**/*.d.ts` in the app, server *and* shared
// programs, while `types/**` is only reachable through an explicit reference
// (which the lint config forbids). Nothing here grants authority: the cookie
// stores only a random opaque session id plus this safe public identity, and
// authorization always re-reads the server-side record and the backend
// `/api/auth/me`. The role union mirrors `packages/shared/src/auth.ts`.

declare module '#auth-utils' {
  interface User {
    id: number
    username: string
    role: 'admin' | 'super_admin'
    avatar: string | null
  }
}

// Route meta may only *restrict* an admin page (the server stays
// authoritative); the admin middleware reads this flag.
declare module '#app' {
  interface PageMeta {
    requiresSuperAdmin?: boolean
  }
}

export {}
