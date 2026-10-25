import { legacyMemberBotLink } from '~/utils/admin-bot'
export default defineNuxtRouteMiddleware(to => {
  const target = legacyMemberBotLink(to.query, to.hash)
  if (target) return navigateTo(target, { replace: true })
})
