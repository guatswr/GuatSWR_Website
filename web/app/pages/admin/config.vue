<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminConfigSchema, adminConfigWriteSchema } from '@guatswr/shared'
import type { AdminConfigKey } from '@guatswr/shared'
import { defaultPublicConfig } from '@guatswr/shared/config'
import { compressUploadImage } from '~/utils/compress-image'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi()
const isSuperAdmin = useBffSession().isSuperAdmin
const query = useQuery({ queryKey: ['admin', 'config'], queryFn: ({ signal }) => api.request({ resource: 'config', signal }, value => adminConfigSchema.parse(value)) })
const pageLoading = query.isPending
const pageError = computed(() => query.error.value ? '未能加载当前配置，请重试后再编辑。' : '')
const saveLoading = ref(false), purgeLoading = ref(false), formError = ref('')
const uploadingKeys = reactive(new Set<AdminConfigKey>())
const configForm = reactive({ home_bg: '', join_bg: '', banner_text: '', badge_image: '', mascot_image: '', qq_qr_image: '', qq_group_number: '', qq_join_url: '', join_question: String(defaultPublicConfig.join_question) })
type ConfigKey = keyof typeof configForm
const imageConfigs: { key: ConfigKey; label: string; desc: string }[] = [
  { key: 'home_bg', label: '主页背景', desc: '首页大幅背景图' },
  { key: 'join_bg', label: '加群背景', desc: '加群页面背景图' },
  { key: 'badge_image', label: '群头像 / 站点 Logo', desc: '用于导航、首页署名与浏览器标签页图标' },
  { key: 'mascot_image', label: '看板娘', desc: '笨琪露的自拍照' },
  { key: 'qq_qr_image', label: '加群二维码', desc: 'QQ二维码' },
]
function copyConfig() {
  const data = query.data.value
  if (!data) return
  for (const key of Object.keys(configForm) as ConfigKey[]) configForm[key] = data[key]
}
watch(query.data, copyConfig, { immediate: true })
async function fetchConfig() { await query.refetch(); copyConfig() }
async function handleUpload(key: ConfigKey, event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || uploadingKeys.has(key)) return
  input.value = ''; uploadingKeys.add(key)
  try {
    configForm[key] = await api.upload(key === 'qq_qr_image' ? file : await compressUploadImage(file))
    ElMessage.success('上传成功，记得点击保存')
  } catch { ElMessage.error('上传失败') }
  finally { uploadingKeys.delete(key) }
}
async function saveConfig() {
  if (saveLoading.value || pageLoading.value || pageError.value || uploadingKeys.size) return
  formError.value = ''
  const writes = []
  // Validate every field before the first request. The frozen API updates one
  // key at a time, so a later failure must honestly report partial success.
  for (const key of Object.keys(configForm) as ConfigKey[]) {
    const parsed = adminConfigWriteSchema.safeParse({ key, value: configForm[key] })
    if (!parsed.success) { formError.value = parsed.error.issues[0]?.message ?? '请检查配置'; return }
    if (parsed.data.value !== query.data.value?.[key]) writes.push(parsed.data)
  }
  saveLoading.value = true
  try {
    for (const body of writes) await api.request({ resource: 'config', method: 'PUT', body }, value => value)
    await fetchConfig(); clearNuxtData('public-site-config'); ElMessage.success('全局配置已更新')
  } catch { ElMessage.error('保存失败，部分配置可能未更新') }
  finally { saveLoading.value = false }
}
async function purgeRecycleBin() {
  if (purgeLoading.value) return
  try {
    await ElMessageBox.confirm('将永久删除回收站中的文章、住民、群史及其关联图片；不包括活动管理中的已删除活动。\n此操作不可撤销！', '清空回收站', { type: 'warning', confirmButtonText: '确定彻底删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' })
    purgeLoading.value = true
    await api.command('recyclePurge', {}, value => value)
    await ElMessageBox.alert('清理完成！', '操作成功', { type: 'success' })
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('清空失败') }
  finally { purgeLoading.value = false }
}
</script>
<template>
<div class="admin-stack">
    <AdminPanel title="全局资源配置" description="更新图片、网站介绍与入群信息。">
      <template #actions><button class="admin-button admin-button--primary" :disabled="saveLoading || pageLoading || !!pageError || uploadingKeys.size > 0" @click="saveConfig">{{ saveLoading ? '保存中…' : '保存所有配置' }}</button></template>
      <div v-if="pageLoading" class="admin-empty" role="status">正在加载配置…</div>
      <div v-else-if="pageError" class="admin-notice admin-notice--error" role="alert">{{ pageError }}<button class="admin-button" @click="fetchConfig">重新加载配置</button></div>
      <div v-else class="admin-settings-grid">
        <section class="admin-form-grid" aria-labelledby="images-heading"><h3 id="images-heading" class="admin-subheading">图片资源</h3>
          <div v-for="item in imageConfigs" :key="item.key" class="admin-config-image"><img v-if="configForm[item.key]" :src="configForm[item.key]" :alt="`${item.label}预览`" class="admin-image-preview" ><div v-else class="admin-image-placeholder">无图片</div><div class="admin-field"><label :for="`config-${item.key}`">{{ item.label }}</label><input :id="`config-${item.key}`" v-model="configForm[item.key]" placeholder="图片 URL (可直接粘贴链接)" ><small>{{ item.desc }}</small><label :for="`upload-${item.key}`" class="admin-hint">上传新图</label><input :id="`upload-${item.key}`" type="file" accept="image/*" :disabled="uploadingKeys.has(item.key) || saveLoading" @change="handleUpload(item.key, $event)" ><small v-if="uploadingKeys.has(item.key)" role="status">图片上传中…</small></div></div>
        </section>
        <section class="admin-form-grid" aria-labelledby="text-heading"><h3 id="text-heading" class="admin-subheading">文案与入群引导</h3>
          <div class="admin-field"><label for="banner-text">首页副标题</label><input id="banner-text" v-model="configForm.banner_text" placeholder="请输入一些有趣的介绍文字..." ></div>
          <div class="admin-field"><label for="qq-group-number">QQ群号</label><input id="qq-group-number" v-model="configForm.qq_group_number" inputmode="numeric" maxlength="12" placeholder="5 至 12 位数字，可留空" ></div>
          <div class="admin-field"><label for="qq-join-url">入群直达链接</label><input id="qq-join-url" v-model="configForm.qq_join_url" maxlength="1000" placeholder="https://…，可留空" ><small>填写 QQ 提供的 http / https 入群链接；留空则不显示直达入口。</small></div>
          <div class="admin-field"><label for="join-question">入群问题</label><textarea id="join-question" v-model="configForm.join_question" rows="3" maxlength="200" /><small>最多 200 字，留空则不显示问题提示。</small></div>
          <p v-if="formError" class="admin-notice admin-notice--error" role="alert">{{ formError }}</p>
        </section>
      </div>
    </AdminPanel>
    <AdminPanel v-if="isSuperAdmin" title="回收站" description="永久删除已软删除的文章、住民、群史及关联图片；不包括活动管理中的已删除活动。"><div class="admin-danger-zone"><p>清空后无法恢复，请先确认已保存需要保留的数据。</p><button class="admin-button admin-button--danger" :disabled="purgeLoading" @click="purgeRecycleBin">{{ purgeLoading ? '正在清理…' : '彻底清空回收站' }}</button></div></AdminPanel>
  </div>
</template>
