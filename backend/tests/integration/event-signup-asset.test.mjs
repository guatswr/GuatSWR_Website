import { describe, expect, it } from 'vitest'
import { fixture, run, all } from '../helpers/fixture.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createSignupRepository } = require('../../dist/src/modules/events/signup/repository.js')
const { createSignupService } = require('../../dist/src/modules/events/signup/service.js')
const { isAnyAssetTargetReferenced, localAssetPath } = require('../../dist/src/storage/reference-inventory.js')

const isReferenced = (app, url) => isAnyAssetTargetReferenced(app.context.sql.main, [localAssetPath(app.context.PUBLIC_DIR, url)], app.context.PUBLIC_DIR)

describe('Event Signup Avatar Asset Governance (UPLOAD-01)', () => {
  it('records asset reference in shadow index upon successful participant signup', async () => {
    const app = await fixture()
    const store = app.context.sql.main
    const repo = createSignupRepository(store)
    const service = createSignupService({
      repository: repo,
      notify: async () => {},
      publication: undefined,
      publicRoot: app.context.PUBLIC_DIR
    })

    const avatarUrl = '/uploads/img/events/1/avatars/reimu-avatar.webp'
    const identity = { userId: null, visitorIp: '192.168.1.10' }

    // Before signup: avatar is unreferenced
    const beforeRef = await isReferenced(app, avatarUrl)
    expect(beforeRef).toBe(false)

    // Sign up
    await service.signup(1, identity, {
      common_id: 'ReimuHakurei',
      qq: '123456789',
      avatar: avatarUrl,
      machine_sign: 'Desktop-1',
      pilot_source: 'Windows'
    }, null)

    // Verify participant was saved
    const participant = await repo.find(1, identity)
    expect(participant).toBeTruthy()
    expect(participant.avatar).toBe(avatarUrl)

    // Verify asset_references table contains the reference
    const refRows = await store.all(
      "SELECT * FROM asset_references WHERE source_type = 'event_participants' AND source_id = ?",
      [participant.id]
    )
    expect(refRows.length).toBe(1)
    expect(refRows[0].asset_path).toBe(localAssetPath(app.context.PUBLIC_DIR, avatarUrl))
    expect(refRows[0].incomplete).toBe(0)

    // Verify isAnyAssetTargetReferenced returns true
    const afterRef = await isReferenced(app, avatarUrl)
    expect(afterRef).toBe(true)
  })

  it('removes asset reference when participant cancels signup', async () => {
    const app = await fixture()
    const store = app.context.sql.main
    const repo = createSignupRepository(store)
    const service = createSignupService({
      repository: repo,
      notify: async () => {},
      publication: undefined,
      publicRoot: app.context.PUBLIC_DIR
    })

    const avatarUrl = '/uploads/img/events/1/avatars/marisa-avatar.webp'
    const identity = { userId: null, visitorIp: '192.168.1.20' }

    // Sign up
    await service.signup(1, identity, {
      common_id: 'MarisaKirisame',
      qq: '987654321',
      avatar: avatarUrl
    }, null)

    const participant = await repo.find(1, identity)
    expect(participant).toBeTruthy()
    expect(await isReferenced(app, avatarUrl)).toBe(true)

    // Cancel / remove registration
    await service.remove(1, identity)

    // Participant deleted
    const participantAfter = await repo.find(1, identity)
    expect(participantAfter).toBeUndefined()

    // Shadow index reference deleted
    const refRows = await store.all(
      "SELECT * FROM asset_references WHERE source_type = 'event_participants' AND source_id = ?",
      [participant.id]
    )
    expect(refRows.length).toBe(0)

    // Asset is now unreferenced and safe for reclamation
    expect(await isReferenced(app, avatarUrl)).toBe(false)
  })

  it('preserves shared avatar reference when only one participant cancels', async () => {
    const app = await fixture()
    const store = app.context.sql.main
    const repo = createSignupRepository(store)
    const service = createSignupService({
      repository: repo,
      notify: async () => {},
      publication: undefined,
      publicRoot: app.context.PUBLIC_DIR
    })

    const sharedAvatar = '/uploads/img/events/1/avatars/shared-avatar.webp'
    const identity1 = { userId: null, visitorIp: '192.168.1.31' }
    const identity2 = { userId: null, visitorIp: '192.168.1.32' }

    // Both participants use the same default/shared avatar
    await service.signup(1, identity1, { common_id: 'Player1', qq: '111', avatar: sharedAvatar }, null)
    await service.signup(1, identity2, { common_id: 'Player2', qq: '222', avatar: sharedAvatar }, null)

    expect(await isReferenced(app, sharedAvatar)).toBe(true)

    // Player 1 cancels
    await service.remove(1, identity1)

    // Shared avatar MUST STILL be referenced because Player 2 is still registered with it!
    expect(await isReferenced(app, sharedAvatar)).toBe(true)

    // Player 2 cancels
    await service.remove(1, identity2)

    // Now it is unreferenced
    expect(await isReferenced(app, sharedAvatar)).toBe(false)
  })
})
