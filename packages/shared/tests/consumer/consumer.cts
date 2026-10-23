import shared = require('@guatswr/shared')
import config = require('@guatswr/shared/config')
import workflows = require('@guatswr/shared/admin-workflows')
const value: shared.LoginInput = shared.loginSchema.parse({ username: 'test', password: ' pass ' })
const banner: string = config.defaultPublicConfig.banner_text
const status: string = workflows.ADMIN_EVENT_STATUSES[0]
void [value, banner, status]
