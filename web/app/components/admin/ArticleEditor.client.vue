<script setup lang="ts">
import { MdEditor } from 'md-editor-v3'
import type { ExposeParam, ToolbarNames, UploadImgCallBack } from 'md-editor-v3'
import { ElMessage } from 'element-plus'
import { initializeArticleDiagrams, sanitizeArticleDiagram, sanitizeArticlePreview } from '~/utils/admin-editor-runtime'
import { useUiStore } from '~/stores/ui'

const props = defineProps<{ modelValue: string; disabled?: boolean; uploadImage: (file: File) => Promise<string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: []; busy: [value: boolean] }>()
const ui = useUiStore(usePinia()), editor = ref<ExposeParam | null>(null)
watch(() => ui.resolvedTheme, initializeArticleDiagrams, { immediate: true })
const importing = ref(false), uploading = ref(false), sourceMode = ref(false)
const plain = computed(() => sourceMode.value || props.modelValue.length > 200_000)
const busy = computed(() => props.disabled || importing.value || uploading.value)
const id = useId()
const toolbars: ToolbarNames[] = ['bold', 'underline', 'italic', 'strikeThrough', 'title', 'quote', 'unorderedList', 'orderedList', 'task', '-', 'codeRow', 'code', 'link', 'image', 'table', 'mermaid', 'katex', '-', 'revoke', 'next', 'save', '=', 'pageFullscreen', 'fullscreen', 'preview', 'htmlPreview', 'catalog']
let mounted = true
onBeforeUnmount(() => { mounted = false })
async function labelEditor() {
  await nextTick()
  editor.value?.getEditorView()?.contentDOM.setAttribute('aria-label', '文章正文')
}
onMounted(labelEditor)
watch(plain, labelEditor)
async function importMarkdown(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || busy.value) return
  input.value = ''
  if (file.size > 8_000_000 || !/\.(md|markdown|txt)$/i.test(file.name)) { ElMessage.warning('请选择 8 MB 以内的 Markdown 或文本文件'); return }
  importing.value = true; emit('busy', true)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    if (text.length > 2_000_000) throw new Error('Content limit')
    if (mounted) { emit('update:modelValue', text); ElMessage.success('已导入正文，发布后生效') }
  } catch { if (mounted) ElMessage.error('导入失败，请使用 200 万字以内的 UTF-8 文件') }
  finally { importing.value = false; if (mounted) emit('busy', false) }
}
async function uploadImages(files: File[], callback: UploadImgCallBack) {
  if (busy.value || !files.length) return
  if (files.length > 20) { ElMessage.warning('每次最多上传 20 张图片'); return }
  uploading.value = true; emit('busy', true)
  try {
    const urls: string[] = []
    // Sequential and bounded: avoid one editor action opening unbounded uploads.
    for (const file of files) { if (!mounted) return; urls.push(await props.uploadImage(file)) }
    if (mounted) callback(urls)
  } catch { if (mounted) ElMessage.error('正文图片上传失败，请重试') }
  finally { uploading.value = false; if (mounted) emit('busy', false) }
}
</script>
<template>
  <div class="admin-article-editor" :aria-busy="importing || uploading">
    <div class="admin-editor-toolbar"><div class="admin-row-actions" role="group" aria-label="正文编辑方式"><button class="admin-button admin-button--secondary" type="button" :aria-pressed="!plain" :disabled="busy || modelValue.length > 200_000" @click="sourceMode = false">编辑与预览</button><button class="admin-button admin-button--secondary" type="button" :aria-pressed="plain" :disabled="busy" @click="sourceMode = true">Markdown 源码</button></div><div class="admin-field"><label :for="`${id}-import`">导入 Markdown 文件</label><input :id="`${id}-import`" type="file" accept=".md,.markdown,.txt" :disabled="busy" @change="importMarkdown" ></div></div>
    <p v-if="modelValue.length > 200_000" class="admin-notice">正文较长，使用源码模式编辑，内容会完整保留。</p>
    <div v-if="plain" class="admin-field"><label :for="`${id}-source`">文章正文</label><textarea :id="`${id}-source`" :value="modelValue" :disabled="busy" rows="20" maxlength="2000000" spellcheck="false" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @keydown.ctrl.s.prevent="emit('save')" @keydown.meta.s.prevent="emit('save')" /></div>
    <MdEditor v-else ref="editor" :model-value="modelValue" :editor-id="id" :theme="ui.resolvedTheme" language="zh-CN" :toolbars="toolbars" :read-only="busy" :sanitize="sanitizeArticlePreview" :sanitize-mermaid="sanitizeArticleDiagram" :no-prettier="true" :no-echarts="true" :show-code-row-number="true" :max-length="2000000" style="height: 560px" @update:model-value="emit('update:modelValue', $event)" @on-upload-img="uploadImages" @on-save="emit('save')" />
    <p v-if="importing || uploading" class="admin-hint" role="status">{{ importing ? '正在导入正文…' : '正文图片上传中…' }}</p>
  </div>
</template>
