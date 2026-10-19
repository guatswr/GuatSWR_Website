<script setup lang="ts">
/**
 * Login-specific native confirmation modal.
 *
 * Replaces the archived Element Plus `ElMessageBox.alert` without pulling
 * Element Plus (or Reka) into the public login chunk. It preserves the archived
 * copy (`数据无价，谨慎操作。` / `进入管理端`) and resolves like the archived
 * `await ElMessageBox.alert(...)`: dismissing with Escape confirms too, because
 * the archived code navigated after the promise settled either way.
 */
const dialog = ref<HTMLDialogElement | null>(null)
const emit = defineEmits<{ confirm: [] }>()

function show() {
  const element = dialog.value
  if (!element || element.open) return
  element.showModal()
}

function confirm() {
  const element = dialog.value
  if (element?.open) element.close()
  emit('confirm')
}

defineExpose({ show })
</script>

<template>
  <dialog
    ref="dialog"
    class="login-confirm"
    aria-labelledby="login-confirm-title"
    aria-describedby="login-confirm-body"
    @cancel.prevent="confirm"
  >
    <div class="login-confirm-card">
      <h2 id="login-confirm-title" class="login-confirm-title">提示</h2>
      <p id="login-confirm-body" class="login-confirm-body">数据无价，谨慎操作。</p>
      <button type="button" class="login-confirm-button" autofocus @click="confirm">进入管理端</button>
    </div>
  </dialog>
</template>

<style scoped>
.login-confirm {
  margin: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
}
.login-confirm::backdrop {
  background: rgba(17, 24, 39, 0.7);
}
.login-confirm-card {
  width: min(20rem, 90vw);
  padding: 1.5rem;
  border-radius: 1rem;
  background: rgba(31, 41, 55, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  text-align: center;
}
.login-confirm-title {
  font-size: 1rem;
  font-weight: 700;
  color: #f9fafb;
}
.login-confirm-body {
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #d1d5db;
}
.login-confirm-button {
  margin-top: 1.25rem;
  width: 100%;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  background: #dc2626;
  color: #fff;
  font-weight: 700;
  transition: background-color 0.2s ease, transform 0.2s ease;
}
.login-confirm-button:hover {
  background: #b91c1c;
  transform: scale(1.02);
}
.login-confirm-button:focus-visible {
  outline: 2px solid #fca5a5;
  outline-offset: 2px;
}
</style>
