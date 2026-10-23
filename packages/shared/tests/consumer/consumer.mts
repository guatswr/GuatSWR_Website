import { loginSchema, type LoginInput } from '@guatswr/shared'
import { defaultPublicConfig } from '@guatswr/shared/config'
import { ADMIN_EVENT_STATUSES } from '@guatswr/shared/admin-workflows'
const value: LoginInput = loginSchema.parse({ username: 'test', password: ' pass ' })
const banner: string = defaultPublicConfig.banner_text
const status: string = ADMIN_EVENT_STATUSES[0]
void [value, banner, status]
