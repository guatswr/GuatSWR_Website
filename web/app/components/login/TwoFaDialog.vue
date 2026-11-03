<script setup lang="ts">
/**
 * Login-specific 2FA second-password modal dialog.
 *
 * Appears when valid username and password credentials are entered for an account
 * that has two-factor authentication (second password) enabled.
 */
const dialog = ref<HTMLDialogElement | null>(null)
const twofaInput = ref<HTMLInputElement | null>(null)
const twofaPassword = ref('')
const errorMsg = ref('')
const isSubmitting = ref(false)
const targetUsername = ref('')

const emit = defineEmits<{
  submit: [twofa: string]
  cancel: []
}>()

function open(username: string) {
  targetUsername.value = username
  twofaPassword.value = ''
  errorMsg.value = ''
  isSubmitting.value = false
  const element = dialog.value
  if (!element || element.open) return
  element.showModal()
  nextTick(() => {
    twofaInput.value?.focus()
  })
}

function close() {
  const element = dialog.value
  if (element?.open) element.close()
  twofaPassword.value = ''
  errorMsg.value = ''
  isSubmitting.value = false
  emit('cancel')
}

function setError(msg: string) {
  errorMsg.value = msg
  nextTick(() => {
    twofaInput.value?.focus()
    twofaInput.value?.select()
  })
}

function setLoading(loading: boolean) {
  isSubmitting.value = loading
}

function handleSubmit() {
  if (isSubmitting.value) return
  const val = twofaPassword.value.trim()
  if (!val) {
    errorMsg.value = '请输入二步密码'
    twofaInput.value?.focus()
    return
  }
  errorMsg.value = ''
  emit('submit', twofaPassword.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

defineExpose({
  open,
  close,
  setError,
  setLoading,
})
</script>

<template>
  <dialog
    ref="dialog"
    class="login-twofa-modal"
    aria-labelledby="login-twofa-title"
    aria-describedby="login-twofa-desc"
    @keydown="handleKeydown"
  >
    <div class="login-twofa-card">
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-600/20 border border-red-500/30 text-red-400 mb-3 text-xl font-bold">
          🔑
        </div>
        <h2 id="login-twofa-title" class="text-xl font-bold text-white tracking-wide">二步验证</h2>
        <p id="login-twofa-desc" class="text-gray-400 text-xs mt-1.5">
          账号 <span class="text-red-400 font-semibold">{{ targetUsername }}</span> 已启用二步验证，请输入二步密码
        </p>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label for="modal-twofa-input" class="sr-only">二步密码</label>
          <input
            id="modal-twofa-input"
            ref="twofaInput"
            v-model="twofaPassword"
            type="password"
            autocomplete="current-password"
            maxlength="50"
            placeholder="请输入二步密码"
            class="w-full px-4 py-3 rounded-lg bg-gray-800/80 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500 text-sm"
            :disabled="isSubmitting"
          >
        </div>

        <div
          v-if="errorMsg"
          role="alert"
          class="text-red-400 text-xs text-center bg-red-900/30 py-2 px-3 rounded border border-red-800/50 animate-pulse font-medium"
        >
          ⚠️ {{ errorMsg }}
        </div>

        <div class="flex gap-3 pt-2">
          <button
            type="button"
            :disabled="isSubmitting"
            class="flex-1 px-4 py-2.5 rounded-lg bg-gray-700/60 hover:bg-gray-700 text-gray-300 hover:text-white font-medium text-sm transition disabled:opacity-50"
            @click="close"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition shadow-lg shadow-red-900/40 disabled:opacity-50 flex items-center justify-center cursor-pointer"
          >
            <span v-if="isSubmitting" class="animate-spin mr-1.5" aria-hidden="true">☯</span>
            {{ isSubmitting ? '验证中...' : '验证并登录' }}
          </button>
        </div>
      </form>
    </div>
  </dialog>
</template>

<style scoped>
.login-twofa-modal {
  margin: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
}
.login-twofa-modal::backdrop {
  background: rgba(17, 24, 39, 0.75);
  backdrop-filter: blur(4px);
}
.login-twofa-card {
  width: min(22rem, 92vw);
  padding: 1.75rem;
  border-radius: 1rem;
  background: rgba(31, 41, 55, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
}
</style>
