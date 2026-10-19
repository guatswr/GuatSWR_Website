<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import AdminAvatar from '~/components/admin/Avatar.vue'
import { ElMessage } from 'element-plus'
import { profileInputSchema } from '@guatswr/shared'
import type { ProfileInput } from '@guatswr/shared'
import { compressUploadImage } from '~/utils/compress-image'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi(), session = useBffSession()
const username = computed(() => session.user.value?.username ?? '')
const isSuperAdmin = session.isSuperAdmin
const pageLoading = ref(false), saveLoading = ref(false), isUploadingAvatar = ref(false)
const showPassword = ref(false), showTwoFaPassword = ref(false)
const initialTwofaEnabled = ref(session.state.value.twofaEnabled)
const profileForm = reactive({ avatar: session.user.value?.avatar ?? '', password: '', twofa_password: '', twofa_enabled: session.state.value.twofaEnabled })
async function fetchProfile() {
  pageLoading.value = true
  try {
    await session.refresh()
    if (!session.isAuthenticated.value) return
    profileForm.avatar = session.user.value?.avatar ?? ''
    profileForm.twofa_enabled = session.state.value.twofaEnabled
    initialTwofaEnabled.value = profileForm.twofa_enabled
  } catch { ElMessage.error('获取个人信息失败') }
  finally { pageLoading.value = false }
}
async function handleProfileAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || isUploadingAvatar.value) return
  isUploadingAvatar.value = true
  try { profileForm.avatar = await api.upload(await compressUploadImage(file)); ElMessage.success('头像上传成功') }
  catch { ElMessage.error('头像上传失败') }
  finally { isUploadingAvatar.value = false; input.value = '' }
}
async function updateProfile() {
  if (saveLoading.value || isUploadingAvatar.value || pageLoading.value) return
  const payload: ProfileInput = { avatar: profileForm.avatar }
  // Passwords remain byte-exact, matching login validation. No implicit trim.
  if (profileForm.password) payload.password = profileForm.password
  if (profileForm.twofa_password) payload.twofa_password = profileForm.twofa_password
  if (profileForm.twofa_enabled !== initialTwofaEnabled.value) {
    if (profileForm.twofa_enabled && !payload.twofa_password) { ElMessage.warning('开启二步验证需要设置二步密码'); return }
    payload.twofa_enabled = profileForm.twofa_enabled
  }
  const parsed = profileInputSchema.safeParse(payload)
  if (!parsed.success) { ElMessage.warning(parsed.error.issues[0]?.message ?? '请检查个人信息'); return }
  saveLoading.value = true
  try {
    await api.command('profileUpdate', parsed.data, value => value)
    profileForm.password = ''; profileForm.twofa_password = ''
    ElMessage.success(session.isAuthenticated.value ? '个人资料已更新' : '个人资料已更新，请重新登录')
    if (session.isAuthenticated.value) await fetchProfile()
  } catch { ElMessage.error('更新失败') }
  finally { saveLoading.value = false }
}
</script>
<template>
<div class="admin-narrow"><AdminPanel title="个人资料设置" description="维护头像与账号安全。修改密码或二步验证后需要重新登录。">
    <form class="admin-form-grid" @submit.prevent="updateProfile">
      <div class="admin-upload-row"><AdminAvatar :src="profileForm.avatar" :name="username" /><div><strong>{{ username }}</strong><p class="admin-hint">{{ isSuperAdmin ? '超级管理员' : '管理员' }}</p></div></div>
      <div class="admin-field"><label for="profile-avatar">更换头像</label><input id="profile-avatar" type="file" accept="image/*" :disabled="isUploadingAvatar || saveLoading" @change="handleProfileAvatarUpload" ><small role="status">{{ isUploadingAvatar ? '头像上传中…' : '上传后请保存修改。' }}</small></div>
      <div class="admin-field"><label for="profile-password">修改登录密码</label><div class="admin-password-field"><input id="profile-password" v-model="profileForm.password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="如果不修改，请留空" ><button type="button" class="admin-button admin-button--quiet" :aria-pressed="showPassword" aria-controls="profile-password" @click="showPassword = !showPassword">{{ showPassword ? '隐藏密码' : '显示密码' }}</button></div></div>
      <label class="admin-check-label"><input v-model="profileForm.twofa_enabled" type="checkbox" >启用二步验证（2FA）</label>
      <div v-if="profileForm.twofa_enabled" class="admin-field"><label for="profile-twofa">二步验证密码</label><div class="admin-password-field"><input id="profile-twofa" v-model="profileForm.twofa_password" :type="showTwoFaPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="设置新的二步验证密码" ><button class="admin-button admin-button--quiet" type="button" :aria-pressed="showTwoFaPassword" aria-controls="profile-twofa" @click="showTwoFaPassword = !showTwoFaPassword">{{ showTwoFaPassword ? '隐藏二步密码' : '显示二步密码' }}</button></div><small>已启用时，留空保留现有二步密码；首次启用需要填写。</small></div>
      <button class="admin-button admin-button--primary" type="submit" :disabled="saveLoading || pageLoading || isUploadingAvatar">{{ saveLoading ? '保存中…' : '保存修改' }}</button>
    </form>
  </AdminPanel></div>
</template>
