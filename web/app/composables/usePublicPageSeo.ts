import type { MaybeRefOrGetter } from 'vue'
import type { PublicSeoInput } from '~/utils/public-seo'
import { usePublicSeo } from './usePublicSeo'

/** Compatibility name for the prose pages; one metadata implementation. */
export function usePublicPageSeo(input: MaybeRefOrGetter<PublicSeoInput>): void {
  usePublicSeo(input)
}
