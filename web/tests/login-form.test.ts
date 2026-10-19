import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useForm } from '@tanstack/vue-form'
import {
  createLoginFormValues,
  loginFormSchema,
  loginPasswordField,
  loginTwofaField,
  loginUsernameField,
  normalizeLoginFormValue,
} from '@guatswr/shared'

// Real TanStack Form + Standard Schema contract, rendered with Vue's SSR
// renderer so it runs on Node without a DOM environment. @tanstack/vue-form is
// not installed in this worktree; the test is written for the pinned 1.33.5 API
// (validators with a Standard Schema, form/field state, handleSubmit, reset).

interface FieldLike {
  state: { value: string }
  handleChange: (value: string) => void
  handleBlur: () => void
}

async function mountLoginForm(onSubmit: (value: Record<string, unknown>) => void | Promise<void>) {
  const captured: Record<string, FieldLike> = {}
  let form: ReturnType<typeof useForm> | undefined

  const app = createSSRApp(defineComponent({
    setup() {
      form = useForm({
        defaultValues: createLoginFormValues(),
        validators: { onSubmit: loginFormSchema },
        onSubmit: async ({ value }) => {
          await onSubmit(value as Record<string, unknown>)
        },
      })
      const currentForm = form
      return () => h('form', [
        // `form.Field` is the component `useForm` binds to its own FormApi; the
        // standalone `Field` export requires a `form` prop and would fail.
        (['username', 'password', 'twofa'] as const).map(name => h(currentForm.Field, {
          name,
          validators: {
            onBlur: name === 'username' ? loginUsernameField : name === 'password' ? loginPasswordField : loginTwofaField,
          },
        }, {
          default: ({ field }: { field: FieldLike }) => {
            captured[name] = field
            return h('input', {
              id: `login-${name}`,
              name,
              value: field.state.value,
              'aria-invalid': field.state.value.length > 0 ? undefined : 'true',
              onInput: (event: Event) => field.handleChange((event.target as HTMLInputElement).value),
              onBlur: () => field.handleBlur(),
            })
          },
        })),
        h('output', { id: 'can-submit' }, String(currentForm.state.isSubmitting)),
      ])
    },
  }))

  const renderedHtml = await renderToString(app)
  if (!form) throw new Error('form was not created during SSR render')
  return { form, captured, renderedHtml }
}

describe('login form contract (real TanStack Form)', () => {
  it('renders the three fields from form state', async () => {
    const { form, renderedHtml } = await mountLoginForm(() => {})
    expect(Object.keys(form.state.values)).toEqual(['username', 'password', 'twofa'])
    expect(renderedHtml).toContain('id="login-username"')
    expect(renderedHtml).toContain('id="login-password"')
    expect(renderedHtml).toContain('id="login-twofa"')
  })

  it('blocks submit on schema violations and reports field-scoped issues', async () => {
    const submitted = vi.fn()
    const { form } = await mountLoginForm(submitted)

    form.setFieldValue('username', 'bad user')
    form.setFieldValue('password', '')
    await form.handleSubmit()

    expect(submitted).not.toHaveBeenCalled()
    // For a Standard Schema submit validator, TanStack Form 1.33.5 puts the
    // path-keyed issue map on the form-level error map and the per-field issue
    // list on each field's meta (there is no `{ fields }` wrapper).
    const submitErrors = form.state.errorMap.onSubmit as Record<string, unknown> | undefined
    expect(submitErrors).toBeTruthy()
    expect(Object.keys(submitErrors ?? {})).toEqual(expect.arrayContaining(['username', 'password']))
    expect(form.getFieldMeta('username')?.errorMap.onSubmit).toBeTruthy()
    expect(form.getFieldMeta('password')?.errorMap.onSubmit).toBeTruthy()
    expect(form.getFieldMeta('twofa')?.errorMap.onSubmit).toBeFalsy()
  })

  it('submits only after validation passes, tracking dirty and submitting state', async () => {
    let release: (() => void) | undefined
    let notifyStarted: () => void = () => {}
    // Validation is asynchronous, so wait for the submit handler itself to run
    // instead of guessing a microtask count.
    const submitStarted = new Promise<void>((resolve) => { notifyStarted = resolve })
    const submitted: Record<string, unknown>[] = []
    const { form } = await mountLoginForm(async (value) => {
      submitted.push(value)
      notifyStarted()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })

    expect(form.state.isDirty).toBe(false)
    form.setFieldValue('username', '  admin_1  ')
    form.setFieldValue('password', ' secret ')
    form.setFieldValue('twofa', '   ')
    expect(form.state.isDirty).toBe(true)

    const pending = form.handleSubmit()
    await submitStarted
    expect(form.state.isSubmitting).toBe(true)
    expect(form.state.canSubmit).toBe(false)
    release?.()
    await pending
    expect(form.state.isSubmitting).toBe(false)
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toEqual({ username: '  admin_1  ', password: ' secret ', twofa: '   ' })
  })

  it('normalizes raw values into the frozen v1 login body', async () => {
    const { form } = await mountLoginForm(() => {})

    form.setFieldValue('username', '  admin_1  ')
    form.setFieldValue('password', ' secret ')
    form.setFieldValue('twofa', ' 123456 ')
    await form.handleSubmit()
    const withTwofa = normalizeLoginFormValue(form.state.values as { username: string, password: string, twofa: string })
    expect(withTwofa).toEqual({ username: 'admin_1', password: ' secret ', twofa: ' 123456 ' })

    form.setFieldValue('twofa', '   ')
    await form.handleSubmit()
    const withoutTwofa = normalizeLoginFormValue(form.state.values as { username: string, password: string, twofa: string })
    expect(withoutTwofa).toEqual({ username: 'admin_1', password: ' secret ' })
    expect(withoutTwofa).not.toHaveProperty('twofa')
  })

  it('resets values and dirty state back to the empty login form', async () => {
    const { form } = await mountLoginForm(() => {})
    form.setFieldValue('username', 'admin')
    form.setFieldValue('password', 'secret')
    expect(form.state.isDirty).toBe(true)
    form.reset()
    expect(form.state.values).toEqual(createLoginFormValues())
    expect(form.state.isDirty).toBe(false)
  })

  it('accepts the exact frozen username/password/second-password semantics', () => {
    // Blank optional twofa and whitespace-only twofa are both "not provided".
    expect(normalizeLoginFormValue({ username: ' admin ', password: ' pass ', twofa: '' }))
      .toEqual({ username: 'admin', password: ' pass ' })
    expect(normalizeLoginFormValue({ username: 'admin', password: ' pass ', twofa: '   ' }))
      .toEqual({ username: 'admin', password: ' pass ' })
    // The password is never trimmed; the second password is preserved byte-for-byte.
    expect(normalizeLoginFormValue({ username: 'admin', password: '  secret  ', twofa: ' 12 34 ' }).password)
      .toBe('  secret  ')
    expect(normalizeLoginFormValue({ username: 'admin', password: 'x', twofa: ' 12 34 ' }).twofa).toBe(' 12 34 ')
    // Three-character second passwords stay invalid rather than becoming TOTP.
    expect(loginFormSchema.safeParse({ username: 'admin', password: 'x', twofa: '123' }).success).toBe(false)
    expect(() => normalizeLoginFormValue({ username: 'bad user', password: 'x', twofa: '' })).toThrow()
  })
})
