import { expect, it } from 'vitest'
import { botPageLink, resolveBotSection, legacyMemberBotLink, botMemberId, botActionLink } from '../app/utils/admin-bot'
import { botDeliveryRowSchema } from '@guatswr/shared/bot'
it('keeps Bot bookmarks within the current role and fixed local sections', () => {
  expect(resolveBotSection('sync',true)).toBe('sync')
  for(const section of ['credentials','sync','deliveries','../private', ['profiles']]) expect(resolveBotSection(section,false)).toBe('profiles')
  expect(botPageLink('profiles',12)).toBe('/admin/bot?section=profiles&member=12')
  expect(botMemberId('../12')).toBeNull()
  expect(botMemberId('9007199254740992')).toBeNull()
})
it('links Bot audit actions to their dedicated area and projects delivery metadata only',()=>{
  expect(botActionLink('BOT_CREDENTIAL_REVEAL')).toBe('/admin/bot?section=credentials')
  expect(botActionLink('MEMBER_SYNC_APPLY')).toBe('/admin/bot?section=sync')
  expect(botActionLink('CREATE_HISTORY')).toBeNull()
  const result=botDeliveryRowSchema.parse({id:'12345678-1234-4234-8234-123456789abc',status:'pending',event_name:'history.updated',group_id:'123456',attempts:0,last_error:null,delivered_at:null,payload:'private',target_id:'private'})
  expect(result).not.toHaveProperty('payload');expect(result).not.toHaveProperty('target_id')
})
it('redirects old Bot member task links without hijacking ordinary member editing',()=>{
  expect(legacyMemberBotLink({pending:'1'},'')).toBe('/admin/bot?section=profiles')
  expect(legacyMemberBotLink({pending:'1',member:'12'},'')).toBe('/admin/bot?section=profiles&member=12')
  expect(legacyMemberBotLink({},'#member-sync')).toBe('/admin/bot?section=sync')
  expect(legacyMemberBotLink({edit:'12'},'')).toBeNull()
  expect(legacyMemberBotLink({pending:['1']},'')).toBeNull()
})
