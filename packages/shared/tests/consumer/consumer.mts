import { loginSchema, type LoginInput } from '@guatswr/shared'
import { defaultPublicConfig } from '@guatswr/shared/config'
import { ADMIN_EVENT_STATUSES } from '@guatswr/shared/admin-workflows'
import { memberSchema, type BackendV1Member } from '@guatswr/shared/backend-v1'
const value: LoginInput = loginSchema.parse({ username: 'test', password: ' pass ' })
const banner: string = defaultPublicConfig.banner_text
const status: string = ADMIN_EVENT_STATUSES[0]
const legacy: BackendV1Member = memberSchema.parse({ name: 'test', role: 'member' })
void [value, banner, status, legacy]
