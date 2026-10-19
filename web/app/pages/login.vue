<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'
import {
  createLoginFormValues,
  loginPasswordField,
  loginTwofaField,
  loginUsernameField,
  normalizeLoginFormValue,
} from '@guatswr/shared'
import { bffErrorMessage, safeLocalReturnPath } from '~/utils/bff-client'
import { pickLoginBackground } from '~/utils/login-background'
import { focusFirstInvalidField, validationErrorText } from '~/utils/login-form'
import { clearLegacyAuthStorage } from '~/utils/legacy-auth-cleanup'

// The archived router renders Login inside App.vue, so the navbar and footer
// are part of the archived login visuals: keep the default layout rather than
// inventing a standalone page.
useSeoMeta({ title: '登录', robots: 'noindex, nofollow' })

const route = useRoute()
const session = useBffSession()
onMounted(() => {
  try { clearLegacyAuthStorage(localStorage, document) } catch { /* Storage can be disabled. */ }
})

const formElement = ref<HTMLFormElement | null>(null)
const confirmDialog = ref<{ show: () => void } | null>(null)
const currentBg = ref('')
const errorMsg = ref('')
const verifyMsg = ref('')
const verifying = ref(false)

// Same-origin only; unsafe targets fall back to the archived /admin default.
const returnPath = safeLocalReturnPath(route.query.redirect)

const usernameValidators = { onBlur: loginUsernameField, onSubmit: loginUsernameField }
const passwordValidators = { onBlur: loginPasswordField, onSubmit: loginPasswordField }
const twofaValidators = { onBlur: loginTwofaField, onSubmit: loginTwofaField }

const form = useForm({
  defaultValues: createLoginFormValues(),
  onSubmit: async ({ value }) => {
    errorMsg.value = ''
    try {
      await session.login(normalizeLoginFormValue(value))
      // Navigate only after the user confirms, matching the archived alert.
      confirmDialog.value?.show()
    }
    catch (error) {
      errorMsg.value = bffErrorMessage(error, '服务器连接失败，请检查网络或后端状态')
    }
  },
})

async function submit() {
  errorMsg.value = ''
  try {
    await form.handleSubmit()
  }
  finally {
    // Validation failures never reach onSubmit; on success there is no
    // aria-invalid control, so this cannot steal focus from the modal.
    //
    // The `aria-invalid` attributes are rendered from the field state TanStack
    // Form just updated, and Vue applies that patch asynchronously: querying
    // the DOM before the flush finds no invalid control and focus stays where
    // the click left it. Wait for the render, then move focus.
    await nextTick()
    focusFirstInvalidField(formElement.value)
  }
}

async function confirmEntry() {
  await navigateTo(returnPath ?? '/admin')
}

onMounted(async () => {
  currentBg.value = pickLoginBackground()

  verifying.value = true
  try {
    const snapshot = await session.refresh()
    if (snapshot.status === 'authenticated') {
      verifyMsg.value = '检测到登录状态，正在验证...'
      await navigateTo(returnPath ?? '/admin', { replace: true })
    }
  }
  finally {
    verifying.value = false
    verifyMsg.value = ''
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900 relative overflow-hidden">
    <div
      v-if="currentBg"
      class="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 transition-all duration-1000 ease-in-out"
      :style="{ backgroundImage: `url('${currentBg}')` }"
    />

    <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent" />

    <div class="login-card relative z-10 w-full max-w-md p-8 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out]">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white font-serif tracking-widest">博丽神社办事处</h1>
        <p class="text-gray-400 text-sm mt-2">GuatSWR Administration</p>
      </div>

      <form ref="formElement" class="space-y-6" novalidate @submit.prevent="submit">
        <form.Field name="username" :validators="usernameValidators">
          <template #default="{ field }">
            <div>
              <label for="login-username" class="block text-gray-300 text-sm font-bold mb-2">Username</label>
              <input
                id="login-username"
                name="username"
                type="text"
                autocomplete="username"
                maxlength="50"
                :value="field.state.value"
                :aria-invalid="field.state.meta.isValid ? undefined : 'true'"
                :aria-describedby="field.state.meta.isValid ? undefined : 'login-username-error'"
                class="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500"
                placeholder="请输入管理员账号"
                required
                @blur="field.handleBlur"
                @input="field.handleChange(($event.target as HTMLInputElement).value)"
              >
              <p v-if="!field.state.meta.isValid" id="login-username-error" role="alert" class="mt-2 text-red-300 text-xs">
                {{ validationErrorText(field.state.meta.errors) }}
              </p>
            </div>
          </template>
        </form.Field>

        <form.Field name="password" :validators="passwordValidators">
          <template #default="{ field }">
            <div>
              <label for="login-password" class="block text-gray-300 text-sm font-bold mb-2">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autocomplete="current-password"
                maxlength="100"
                :value="field.state.value"
                :aria-invalid="field.state.meta.isValid ? undefined : 'true'"
                :aria-describedby="field.state.meta.isValid ? undefined : 'login-password-error'"
                class="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500"
                placeholder="请输入密码"
                required
                @blur="field.handleBlur"
                @input="field.handleChange(($event.target as HTMLInputElement).value)"
              >
              <p v-if="!field.state.meta.isValid" id="login-password-error" role="alert" class="mt-2 text-red-300 text-xs">
                {{ validationErrorText(field.state.meta.errors) }}
              </p>
            </div>
          </template>
        </form.Field>

        <form.Field name="twofa" :validators="twofaValidators">
          <template #default="{ field }">
            <div>
              <label for="login-twofa" class="block text-gray-300 text-sm font-bold mb-2">二步密码 (可选)</label>
              <input
                id="login-twofa"
                name="twofa"
                type="password"
                autocomplete="off"
                maxlength="50"
                :value="field.state.value"
                :aria-invalid="field.state.meta.isValid ? undefined : 'true'"
                :aria-describedby="field.state.meta.isValid ? undefined : 'login-twofa-error'"
                class="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500"
                placeholder="已启用二步密码时必填"
                @blur="field.handleBlur"
                @input="field.handleChange(($event.target as HTMLInputElement).value)"
              >
              <p v-if="!field.state.meta.isValid" id="login-twofa-error" role="alert" class="mt-2 text-red-300 text-xs">
                {{ validationErrorText(field.state.meta.errors) }}
              </p>
            </div>
          </template>
        </form.Field>

        <div
          v-if="errorMsg"
          role="alert"
          class="text-red-400 text-sm text-center bg-red-900/20 py-2 rounded border border-red-900/50 animate-pulse font-bold"
        >
          ⚠️ {{ errorMsg }}
        </div>

        <div
          v-if="verifyMsg"
          aria-live="polite"
          class="text-amber-200 text-xs text-center bg-amber-900/20 py-2 rounded border border-amber-900/50"
        >
          {{ verifyMsg }}
        </div>

        <!--
          Enabled while the form is invalid, like the archived
          `:disabled="loading || verifying"`: the per-field errors and the focus
          of the first invalid field replace native validation bubbles, so a
          submit must be attemptable with invalid input. Gating on TanStack's
          `canSubmit` disabled the button as soon as a field was blurred with
          invalid input, which made that path unreachable. Duplicate submits are
          still prevented by `isSubmitting` (and the button's own label).
        -->
        <form.Subscribe v-slot="{ isSubmitting }">
          <button
            type="submit"
            :disabled="isSubmitting || verifying"
            :aria-busy="isSubmitting"
            class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-lg shadow-red-900/50"
          >
            <span v-if="isSubmitting" class="animate-spin mr-2" aria-hidden="true">☯</span>
            {{ isSubmitting ? '正在穿越隙间...' : '登录系统' }}
          </button>
        </form.Subscribe>
      </form>

      <div class="mt-6 text-center text-xs text-gray-500">
        需要管理员账号？请联系Taropoi。
      </div>
    </div>

    <LoginConfirmDialog ref="confirmDialog" @confirm="confirmEntry" />
  </div>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .login-card { animation: none !important; }
}
</style>
