import { z } from 'zod'
import { PUBLIC_EVENT_STATUSES } from './public.js'
export { EVENT_STATUS_LABELS, eventStatusLabel } from './event-labels.js'

/**
 * Shared, framework-free event rules.
 *
 * These are a logical port of the archived `frontend/src/components/events/eventFormModel.js`:
 * the flat UI model, the field catalogue per type, the validation rules, the payload
 * builder (which must preserve rankings/settlement/unknown fields on edits) and the
 * guest draft/submit flow. The frozen backend keeps validating independently; this module
 * never becomes an authority on publishing rights.
 */

/** The five archived event types, in the archived order. */
export const EVENT_TYPES = ['悬赏令', '对赌协议', 'STG', '则则', '线下聚会'] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** The frozen backend only accepts signups (`/signup`) for these types. */
export const SIGNUP_EVENT_TYPES = ['STG', '则则'] as const

export type EventFieldKind =
  | 'text'
  | 'textarea'
  | 'tel'
  | 'datetime-local'
  | 'image'
  | 'select'

export interface EventFormField {
  key: string
  label: string
  kind: EventFieldKind
  required?: boolean
  /** Only rendered (and only required) for the double-bet variant. */
  duo?: boolean
  options?: readonly string[]
  hint?: string
}

const field = (
  key: string,
  label: string,
  kind: EventFieldKind = 'text',
  extra: Partial<EventFormField> = {}
): EventFormField => ({ key, label, kind, ...extra })

const schedule = (key: string, label: string): EventFormField =>
  field(key, label, 'datetime-local', {
    hint: '北京时间；已有的文字时间也会保留。'
  })

export const EVENT_FIELDS: Readonly<Record<EventType, readonly EventFormField[]>> = {
  悬赏令: [
    field('initiator_id', '发起人 ID'),
    field('initiator_qq', '发起人 QQ', 'tel'),
    field('initiator_avatar', '发起人头像', 'image', { required: true }),
    field('challenge', '挑战形式'),
    field('requirements', '挑战要求', 'textarea'),
    field('reward', '奖励', 'text', { required: true }),
    field('limit', '参与限制'),
    schedule('deadline', '截止时间')
  ],
  对赌协议: [
    field('a_id', '发起者 ID'),
    field('a_qq', '发起者 QQ', 'tel'),
    field('a_goal', '发起者目标'),
    field('a_avatar', '发起者头像', 'image', { required: true }),
    field('b_id', '对手 ID', 'text', { duo: true, required: true }),
    field('b_qq', '对手 QQ', 'tel', { duo: true }),
    field('b_goal', '对手目标', 'text', { duo: true }),
    field('b_avatar', '对手头像', 'image', { duo: true, required: true }),
    field('penalty', '惩罚 / 代价', 'textarea'),
    schedule('deadline', '截止时间'),
    field('proof_image', '存档截图', 'image')
  ],
  STG: [
    field('copy', '活动文案', 'textarea'),
    field('cover', '活动封面', 'image'),
    schedule('time', '活动时间'),
    field('rules', '比赛规则', 'textarea'),
    field('prizes', '奖品', 'textarea'),
    field('notes', '注意事项', 'textarea')
  ],
  则则: [
    field('copy', '活动文案', 'textarea'),
    field('cover', '活动封面', 'image'),
    schedule('time', '活动时间'),
    field('rules', '比赛规则', 'textarea'),
    field('prizes', '奖品', 'textarea'),
    field('notes', '注意事项', 'textarea')
  ],
  线下聚会: [
    field('cover', '活动封面', 'image'),
    schedule('time', '聚会时间'),
    field('location', '聚会地点'),
    field('gather_type', '聚会类型', 'select', {
      options: ['小聚', '大聚', '饭聚', '其他']
    }),
    field('notes', '备注', 'textarea')
  ]
}

export type BetMode = 'solo' | 'duo'

export interface EventFormModel {
  type: string
  title: string
  betMode: BetMode
  [key: string]: string
}

export interface EventFormIssue {
  field: string
  message: string
}

export interface EventPayload {
  type: string
  title: string
  content: Record<string, unknown>
}

export const isEventType = (value: unknown): value is EventType =>
  typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value)

export const supportsSignup = (type: unknown): boolean =>
  typeof type === 'string' && (SIGNUP_EVENT_TYPES as readonly string[]).includes(type)

export const isPublicEventStatus = (status: unknown): boolean =>
  typeof status === 'string' &&
  (PUBLIC_EVENT_STATUSES as readonly string[]).includes(status)

export function getEventTypes(
  allowedTypes: readonly string[] = EVENT_TYPES
): EventType[] {
  return [...new Set(allowedTypes)].filter(isEventType)
}

function parseContent(value: unknown): Record<string, unknown> {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export interface EventLike {
  id?: number | string
  type?: string
  title?: string
  status?: string
  content?: unknown
}

export function createEventFormState(
  event: EventLike | null = null,
  allowedTypes: readonly string[] = EVENT_TYPES
): EventFormModel {
  const content = parseContent(event?.content)
  const state: EventFormModel = {
    type: event?.type || allowedTypes[0] || '',
    title: event?.title || '',
    betMode: content.b ? 'duo' : 'solo'
  }
  for (const item of Object.values(EVENT_FIELDS).flat())
    state[item.key] = String(content[item.key] ?? '')
  for (const [prefix, person] of [
    ['initiator', content.initiator],
    ['a', content.a],
    ['b', content.b]
  ] as const) {
    const record = (person ?? {}) as Record<string, unknown>
    for (const key of ['id', 'qq', 'avatar', 'goal'])
      state[`${prefix}_${key}`] = String(record[key] ?? '')
  }
  state.cover = String(content.cover || content.cover_image || content.image || '')
  return state
}

export function getEventFields(form: Pick<EventFormModel, 'type' | 'betMode'>): EventFormField[] {
  const fields = EVENT_FIELDS[form.type as EventType] ?? []
  return fields.filter((item) => !item.duo || form.betMode === 'duo')
}

const allowedTypesSchema = (allowedTypes: readonly string[]) =>
  z.string().refine((value) => allowedTypes.includes(value), {
    message: '请选择支持的活动类型'
  })

/**
 * The flat UI model as a Zod schema, built for the types a page actually allows.
 *
 * Required rules come from the field catalogue of the *selected* type and are
 * reported in catalogue order, exactly like the archived `validateEventForm`
 * (type → title → that type's fields), so validation has a single source.
 */
export function createEventFormSchema(
  allowedTypes: readonly string[] = EVENT_TYPES
): z.ZodType<EventFormModel, EventFormModel> {
  const types = getEventTypes(allowedTypes)
  const shape: Record<string, z.ZodType> = {
    type: allowedTypesSchema(types),
    title: z.string().trim().min(1, '请填写标题'),
    betMode: z.enum(['solo', 'duo'])
  }
  for (const item of Object.values(EVENT_FIELDS).flat()) shape[item.key] ??= z.string()
  // `shape` is an index-signature record, so Zod infers `{ [key: string]: unknown }`
  // for both the input and the output. Every catalogue field is a string and the
  // refinement below enforces the required ones, so a parsed value is an
  // `EventFormModel`; the cast states that once here, where the loose shape is
  // built, rather than at every call site that consumes the Standard Schema.
  return z.object(shape).superRefine((model, ctx) => {
    // `shape` is an index-signature record, so the callback's model type is
    // `{ [key: string]: unknown }`; the schema itself guarantees `type`/`betMode`.
    for (const item of getEventFields(model as Pick<EventFormModel, 'type' | 'betMode'>)) {
      if (!item.required) continue
      if (!String(model[item.key] ?? '').trim())
        ctx.addIssue({
          code: 'custom',
          path: [item.key],
          message: `请填写或上传${item.label}`
        })
    }
  }) as unknown as z.ZodType<EventFormModel, EventFormModel>
}

/** The archived `{ field, message }` shape, derived from the schema's first issue. */
export function validateEventForm(
  form: EventFormModel,
  allowedTypes: readonly string[] = EVENT_TYPES
): EventFormIssue | null {
  const parsed = createEventFormSchema(allowedTypes).safeParse(form)
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  const field = issue?.path[0]
  return {
    field: typeof field === 'string' ? field : 'type',
    message: issue?.message ?? '请检查表单内容'
  }
}

const text = (form: EventFormModel, key: string): string => String(form[key] ?? '').trim()

/**
 * Builds the outgoing DTO. Rankings, settlement, unknown nested fields and future
 * content are retained when editing an event of the same type.
 */
export function buildEventPayload(
  form: EventFormModel,
  initialData: EventLike | null = null
): EventPayload {
  const content: Record<string, unknown> =
    initialData?.type === form.type ? parseContent(initialData.content) : {}
  const values = (...keys: string[]): Record<string, string> =>
    Object.fromEntries(keys.map((key) => [key, text(form, key)]))
  const person = (prefix: string, previous: unknown): Record<string, string> => ({
    ...((previous ?? {}) as Record<string, string>),
    ...Object.fromEntries(
      ['id', 'qq', 'avatar', ...(prefix === 'initiator' ? [] : ['goal'])].map((key) => [
        key,
        text(form, `${prefix}_${key}`)
      ])
    )
  })
  if (form.type === '悬赏令') {
    Object.assign(content, values('challenge', 'requirements', 'reward', 'limit', 'deadline'), {
      initiator: person('initiator', content.initiator)
    })
  } else if (form.type === '对赌协议') {
    Object.assign(content, values('penalty', 'deadline', 'proof_image'), {
      a: person('a', content.a),
      b: form.betMode === 'duo' ? person('b', content.b) : null
    })
  } else if (form.type === 'STG' || form.type === '则则') {
    Object.assign(content, values('copy', 'cover', 'time', 'rules', 'prizes', 'notes'))
  } else if (form.type === '线下聚会') {
    Object.assign(content, values('cover', 'time', 'location', 'gather_type', 'notes'))
  }
  return { type: form.type, title: form.title.trim(), content }
}

// ---------------------------------------------------------------------------
// Zod contracts: the flat UI model is deliberately a different shape from the DTO.
// ---------------------------------------------------------------------------

export const eventPayloadContentSchema = z.record(z.string(), z.unknown())

export const eventTypeSchema = z.enum(EVENT_TYPES)

export const eventPayloadSchema = z.object({
  type: eventTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: eventPayloadContentSchema
})

/** `PUT /:id`: `submit: true` is the guest submission that moves draft → pending. */
export const eventSaveRequestSchema = eventPayloadSchema.extend({
  submit: z.boolean().optional().default(false)
})

export const eventSignupSchema = z.object({
  common_id: z.string().trim().min(1, '请填写常用ID').max(120),
  qq: z.string().trim().min(1, '请填写QQ').max(40),
  avatar: z.string().trim().min(1, '请先上传头像'),
  // The frozen backend normalizes these to '' itself; they stay free-form.
  machine_sign: z.string().trim().max(160).optional().default(''),
  pilot_source: z.string().trim().max(60).optional().default('')
})

export type EventSignupInput = z.infer<typeof eventSignupSchema>

/** Empty signup form, identical in shape to the archived component state. */
export const emptyEventSignup = (): EventSignupInput => ({
  common_id: '',
  qq: '',
  avatar: '',
  machine_sign: '',
  pilot_source: ''
})

/** The visitor's own saved signup, as the archived modal maps it (missing → ''). */
export const eventSignupRecordSchema = z.object({
  id: z.number().int().positive(),
  common_id: z.string().default(''),
  qq: z.string().default(''),
  avatar: z.string().default(''),
  machine_sign: z.string().default(''),
  pilot_source: z.string().default('')
})

export type EventSignupRecord = z.infer<typeof eventSignupRecordSchema>

// ---------------------------------------------------------------------------
// Guest draft/submit flow (archived `createDraftSession` + `saveEventForm`)
// ---------------------------------------------------------------------------

/** Logical API surface; the browser transport maps it onto the BFF paths. */
export interface EventWriteApi {
  createDraft(): Promise<{ id: number }>
  saveDraft(
    id: number,
    payload: EventPayload & { submit: boolean }
  ): Promise<Record<string, unknown>>
  /** Admin-only direct publish; a guest draft never uses this path. */
  publishEvent(payload: EventPayload & { status: string }): Promise<Record<string, unknown>>
}

export interface DraftSession {
  ensureId(): Promise<number>
}

/**
 * One draft id per session, one in-flight create promise, and a failed create stays
 * retriable instead of poisoning the session.
 */
export function createDraftSession(api: EventWriteApi): DraftSession {
  let draftId: number | null = null
  let pending: Promise<number> | null = null
  return {
    async ensureId(): Promise<number> {
      if (draftId) return draftId
      if (!pending) {
        pending = api
          .createDraft()
          .then((response) => {
            const id = Number(response?.id)
            if (!Number.isInteger(id) || id <= 0) throw new Error('未获取到活动草稿，请重试')
            draftId = id
            return id
          })
          .finally(() => {
            pending = null
          })
      }
      return pending
    }
  }
}

export interface SaveEventFormOptions {
  eventId?: number | string | null
  isAdmin: boolean
  draftSession?: DraftSession
}

export async function saveEventForm(
  api: EventWriteApi,
  payload: EventPayload,
  { eventId, isAdmin, draftSession }: SaveEventFormOptions
): Promise<Record<string, unknown>> {
  if (eventId) {
    // submit:false preserves published/ongoing/settled status on the existing PUT endpoint.
    const response = await api.saveDraft(Number(eventId), { ...payload, submit: false })
    return { ...response, id: Number(eventId) }
  }
  if (isAdmin) {
    const response = await api.publishEvent({ ...payload, status: 'published' })
    return response
  }
  if (!draftSession) throw new Error('未获取到活动草稿，请重试')
  const id = await draftSession.ensureId()
  const response = await api.saveDraft(id, { ...payload, submit: true })
  return { ...response, id }
}
