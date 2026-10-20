<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { EVENT_TYPES, buildEventPayload, createEventFormState, getEventFields, validateEventForm } from '@guatswr/shared'
import type { AdminEvent } from '@guatswr/shared/admin-workflows'
import { compressUploadImage } from '~/utils/compress-image'

const props = defineProps<{ initialData: AdminEvent | null }>()
const emit = defineEmits<{ saved: [created: boolean]; dirty: [value: boolean]; busy: [value: boolean] }>()
const api = useAdminApi(), form = reactive(createEventFormState(props.initialData))
const createStatus = ref<'published' | 'draft'>('published'), saving = ref(false), uploading = ref('')
const busy = computed(() => saving.value || Boolean(uploading.value))
const fields = computed(() => getEventFields(form))
const snapshot = () => JSON.stringify([form, createStatus.value])
const baseline = snapshot(), formElement = ref<HTMLFormElement | null>(null)
const error = ref(''), invalidField = ref('')
watch(snapshot, value => emit('dirty', value !== baseline), { immediate: true })
watch(busy, value => emit('busy', value), { immediate: true })
let mounted = true
onBeforeUnmount(() => { mounted = false })
const inputType = (key: string, kind: string) => kind === 'datetime-local' && form[key]
  && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(form[key]!) ? 'text' : kind
async function upload(event: Event, key: string) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  uploading.value = key
  try {
    // The frozen authenticated upload stages files; the event save moves their
    // URLs into the event directory. No guest draft or browser JWT is involved.
    const url = await api.upload(await compressUploadImage(file))
    if (mounted) { form[key] = url; ElMessage.success('图片已上传，保存后生效') }
  } catch { if (mounted) ElMessage.error('图片上传未完成，请重试') }
  finally { uploading.value = '' }
}
async function save() {
  if (busy.value) return
  const issue = validateEventForm(form)
  error.value = issue?.message ?? ''; invalidField.value = issue?.field ?? ''
  if (issue) {
    const control = formElement.value?.elements.namedItem(issue.field)
    if (control instanceof HTMLElement) control.focus()
    return
  }
  if (new TextEncoder().encode(JSON.stringify(buildEventPayload(form, props.initialData))).byteLength > 4 * 1024 * 1024 - 1024) {
    error.value = '活动资料超出 4 MiB 请求上限，请缩短内容或图片地址。'
    return
  }
  saving.value = true
  try {
    const payload = buildEventPayload(form, props.initialData)
    await api.request({ resource: 'events', method: props.initialData ? 'PUT' : 'POST', id: props.initialData?.id,
      body: props.initialData ? { ...payload, submit: false } : { ...payload, status: createStatus.value } }, value => value)
    if (mounted) { emit('dirty', false); emit('saved', !props.initialData); ElMessage.success('活动已保存') }
  } catch { if (mounted) error.value = '保存未完成，请检查活动列表后再决定是否重试；填写内容已保留。' }
  finally { saving.value = false }
}
</script>

<template>
  <form ref="formElement" class="admin-form-grid" novalidate @submit.prevent="save">
    <p class="admin-hint">已有活动的状态、报名、排名和其他资料会保留。日期采用北京时间，旧的文字时间仍可编辑。</p>
    <p v-if="error" class="admin-notice admin-notice--error" role="alert">{{ error }}</p>
    <fieldset class="admin-form-grid" :disabled="busy">
      <div class="admin-form-row"><div class="admin-field"><label for="event-type">活动类型</label><select id="event-type" v-model="form.type" name="type" :disabled="Boolean(initialData)"><option v-for="type in EVENT_TYPES" :key="type">{{ type }}</option></select></div><div class="admin-field"><label for="event-title">活动标题</label><input id="event-title" v-model="form.title" name="title" required maxlength="200" :aria-invalid="invalidField === 'title'" ></div></div>
      <div v-if="!initialData" class="admin-field"><label for="event-create-status">保存方式</label><select id="event-create-status" v-model="createStatus"><option value="published">立即发布</option><option value="draft">保存为草稿</option></select><small>草稿仅在管理端可见；发布后会出现在公开活动列表。</small></div>
      <div v-if="form.type === '对赌协议'" class="admin-field"><label for="event-bet-mode">对赌模式</label><select id="event-bet-mode" v-model="form.betMode"><option value="solo">单人挑战</option><option value="duo">双人对赌</option></select></div>
      <div v-for="field in fields" :key="field.key" class="admin-field">
        <label :for="`event-${field.key}`">{{ field.label }}{{ field.required ? ' *' : '' }}</label>
        <textarea v-if="field.kind === 'textarea'" :id="`event-${field.key}`" v-model="form[field.key]" :name="field.key" rows="4" :aria-invalid="invalidField === field.key" />
        <select v-else-if="field.kind === 'select'" :id="`event-${field.key}`" v-model="form[field.key]" :name="field.key"><option value="">请选择</option><option v-for="option in field.options" :key="option">{{ option }}</option></select>
        <template v-else-if="field.kind === 'image'"><input :id="`event-${field.key}`" v-model="form[field.key]" :name="field.key" placeholder="图片地址，或在下方上传" :aria-invalid="invalidField === field.key" ><img v-if="form[field.key]" :src="form[field.key]" :alt="`${field.label}预览`" class="admin-image-preview" ><label :for="`event-upload-${field.key}`" class="admin-hint">上传{{ field.label }}</label><input :id="`event-upload-${field.key}`" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" @change="upload($event, field.key)" ><small v-if="uploading === field.key" role="status">正在上传…</small></template>
        <input v-else :id="`event-${field.key}`" v-model="form[field.key]" :name="field.key" :type="inputType(field.key, field.kind)" :aria-invalid="invalidField === field.key" >
        <small v-if="field.hint">{{ field.hint }}</small>
      </div>
    </fieldset>
    <div class="admin-form-footer"><button class="admin-button admin-button--primary" :disabled="busy" type="submit">{{ saving ? '保存中…' : initialData ? '保存活动修改' : createStatus === 'draft' ? '保存活动草稿' : '发布活动' }}</button></div>
  </form>
</template>
