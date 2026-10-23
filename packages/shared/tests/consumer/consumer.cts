import shared = require('@guatswr/shared')
import config = require('@guatswr/shared/config')
import workflows = require('@guatswr/shared/admin-workflows')
import wire = require('@guatswr/shared/backend-v1')
const value: shared.LoginInput = shared.loginSchema.parse({ username: 'test', password: ' pass ' })
const banner: string = config.defaultPublicConfig.banner_text
const status: string = workflows.ADMIN_EVENT_STATUSES[0]
const legacy: wire.BackendV1Member = wire.memberSchema.parse({ name: 'test', role: 'member' })
void [value, banner, status, legacy]
