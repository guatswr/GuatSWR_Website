<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { adminConfigSchema, adminConfigWriteSchema } from '@guatswr/shared'
import { adminFriendLinksSchema, adminHomeLinksSchema } from '@guatswr/shared/admin-workflows'
import type { AdminFriendLink, AdminHomeLink } from '@guatswr/shared/admin-workflows'
import { parseFriendLinks, parseHomeLinks } from '~/utils/site-config'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi()
const form = reactive<{ links: AdminHomeLink[]; friendLinks: AdminFriendLink[] }>({ links: [], friendLinks: [] })
const saveLoading = ref(false), uploadingKey = ref('')
const query = useQuery({ queryKey: ['admin', 'config'], queryFn: ({ signal }) => api.request({ resource: 'config', signal }, value => adminConfigSchema.parse(value)) })
const loading = query.isPending
watch(query.error, error => { if (error) ElMessage.error('加载配置失败') })
const previewLinks = computed(() => parseHomeLinks(form.links))
const previewFriendLinks = computed(() => parseFriendLinks(form.friendLinks))

function withDefaults(value: unknown): AdminHomeLink {
  const row: Record<string, unknown> = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const text = (key: string, fallback = '') => typeof row[key] === 'string' ? row[key] as string : fallback
  const flag = (key: string, fallback = false) => typeof row[key] === 'boolean' ? row[key] as boolean : fallback
  return { title: text('title'), subtitle: text('subtitle'), extra: text('extra'), url: text('url'), iconText: text('iconText'), iconUrl: text('iconUrl'), iconBg: text('iconBg', '#000000'), iconColor: text('iconColor', '#ffffff'), textColor: text('textColor', '#666666'), textColorAuto: flag('textColorAuto'), cardBg: text('cardBg', '#ffffff'), cardBgAuto: flag('cardBgAuto'), showOnHome: flag('showOnHome', true) }
}

function withFriendDefaults(value: unknown): AdminFriendLink {
  const row: Record<string, unknown> = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const text = (key: string, fallback = '') => typeof row[key] === 'string' ? row[key] as string : fallback
  return { title: text('title'), subtitle: text('subtitle'), extra: text('extra'), url: text('url'), iconText: text('iconText'), iconUrl: text('iconUrl'), iconBg: text('iconBg', '#000000'), iconColor: text('iconColor', '#ffffff') }
}

const defaultLinks = [
  { title: 'Bilibili 官方账号', subtitle: 'UID: 444257435', extra: '投稿联系管理员: Taropoi', url: 'https://space.bilibili.com/444257435', iconText: 'B', iconBg: '#00a1d6', iconColor: '#ffffff', cardBgAuto: true },
  { title: 'QQ 直播频道', subtitle: '游戏直播分享', extra: '点击加入频道', url: 'https://pd.qq.com/s/fxsvvaqqt', iconText: 'QQ', iconBg: '#666666', iconColor: '#ffffff', cardBgAuto: true },
]

watch(query.data, data => {
  if (!data) return
  if (!data.home_links) {
    form.links = defaultLinks.map(withDefaults)
  } else {
    try { const parsed: unknown = JSON.parse(data.home_links); form.links = Array.isArray(parsed) ? parsed.map(withDefaults) : [] }
    catch { form.links = [] }
  }
  if (!data.friend_links) {
    form.friendLinks = []
  } else {
    try { const parsed: unknown = JSON.parse(data.friend_links); form.friendLinks = Array.isArray(parsed) ? parsed.map(withFriendDefaults) : [] }
    catch { form.friendLinks = [] }
  }
}, { immediate: true })

async function addLink() {
  form.links.push(withDefaults({ title: '新链接', subtitle: '副标题', extra: '简短说明', url: 'https://', iconText: '链', cardBgAuto: true, iconBg: '#3b82f6' }))
  await nextTick(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
}
function removeLink(index: number) { if (!uploadingKey.value) form.links.splice(index, 1) }
function moveLink(index: number, direction: 'up' | 'down') {
  const target = index + (direction === 'up' ? -1 : 1)
  if (uploadingKey.value || target < 0 || target >= form.links.length) return
  const current = form.links[index], other = form.links[target]
  if (current && other) { form.links[index] = other; form.links[target] = current }
}

async function addFriendLink() {
  form.friendLinks.push(withFriendDefaults({ title: '新友链', subtitle: '友社或关联站点', extra: '简短说明', url: 'https://', iconText: '友', iconBg: '#0284c7', iconColor: '#ffffff' }))
  await nextTick(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
}
function removeFriendLink(index: number) { if (!uploadingKey.value) form.friendLinks.splice(index, 1) }
function moveFriendLink(index: number, direction: 'up' | 'down') {
  const target = index + (direction === 'up' ? -1 : 1)
  if (uploadingKey.value || target < 0 || target >= form.friendLinks.length) return
  const current = form.friendLinks[index], other = form.friendLinks[target]
  if (current && other) { form.friendLinks[index] = other; form.friendLinks[target] = current }
}

async function saveLinks() {
  if (saveLoading.value || uploadingKey.value !== '' || loading.value || query.error.value) return
  const parsedHome = adminHomeLinksSchema.safeParse(form.links)
  if (!parsedHome.success) { ElMessage.warning(parsedHome.error.issues[0]?.message ?? '请检查外链配置'); return }
  const parsedFriends = adminFriendLinksSchema.safeParse(form.friendLinks)
  if (!parsedFriends.success) { ElMessage.warning(parsedFriends.error.issues[0]?.message ?? '请检查友情链接配置'); return }
  const writeHome = adminConfigWriteSchema.safeParse({ key: 'home_links', value: JSON.stringify(parsedHome.data) })
  const writeFriends = adminConfigWriteSchema.safeParse({ key: 'friend_links', value: JSON.stringify(parsedFriends.data) })
  if (!writeHome.success || !writeFriends.success) { ElMessage.warning('外链配置超过接口长度限制'); return }
  saveLoading.value = true
  try {
    await api.request({ resource: 'config', method: 'PUT', body: writeHome.data }, value => value)
    if (form.friendLinks.length > 0 || Boolean(query.data.value?.friend_links)) {
      await api.request({ resource: 'config', method: 'PUT', body: writeFriends.data }, value => value)
    }
    await query.refetch(); clearNuxtData('public-site-config'); ElMessage.success('保存成功')
  } catch { ElMessage.error('保存失败') }
  finally { saveLoading.value = false }
}

async function uploadIconFile(event: Event, item: { iconUrl: string }, key: string) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || uploadingKey.value !== '') return
  uploadingKey.value = key
  try { item.iconUrl = await api.uploadIcon(file); ElMessage.success('图标上传成功') }
  catch { ElMessage.error('图标上传失败') }
  finally { uploadingKey.value = ''; input.value = '' }
}
</script>
<template>
  <div class="admin-stack">
    <AdminPanel title="绯想天网络（社群与首页链接）" description="管理社群链接页面的「绯想天网络」板块及首页展示的官方平台卡片；修改后点击保存生效。">
      <template #actions>
        <div class="admin-row-actions">
          <button class="admin-button admin-button--secondary" :disabled="uploadingKey !== '' || saveLoading || loading || query.isError.value || form.links.length >= 50" @click="addLink">新增卡片</button>
          <button class="admin-button admin-button--primary" :disabled="saveLoading || uploadingKey !== '' || loading || query.isError.value" @click="saveLinks">{{ saveLoading ? '保存中…' : '保存' }}</button>
        </div>
      </template>
      <p v-if="loading" class="admin-empty" role="status">正在加载链接…</p>
      <div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">加载链接失败。<button class="admin-button" @click="query.refetch()">重试</button></div>
      <div v-else class="admin-stack">
        <article v-for="(item, idx) in form.links" :key="`home-${idx}`" class="admin-resource-card">
          <div class="admin-resource-heading">
            <h3>{{ idx + 1 }}. {{ item.title || '未命名卡片' }}</h3>
            <div class="admin-row-actions">
              <button class="admin-button admin-button--quiet" :aria-label="`上移第 ${idx + 1} 个链接`" :disabled="idx === 0 || uploadingKey !== ''" @click="moveLink(idx, 'up')">上移</button>
              <button class="admin-button admin-button--quiet" :aria-label="`下移第 ${idx + 1} 个链接`" :disabled="idx === form.links.length - 1 || uploadingKey !== ''" @click="moveLink(idx, 'down')">下移</button>
              <button class="admin-button admin-button--danger" :aria-label="`移除第 ${idx + 1} 个链接`" :disabled="uploadingKey !== ''" @click="removeLink(idx)">移除</button>
            </div>
          </div>
          <div class="admin-link-fields">
            <div class="admin-form-grid">
              <div class="admin-field"><label :for="`link-title-${idx}`">标题</label><input :id="`link-title-${idx}`" v-model="item.title" placeholder="例如：B站账号" ></div>
              <div class="admin-field"><label :for="`link-subtitle-${idx}`">副标题</label><input :id="`link-subtitle-${idx}`" v-model="item.subtitle" placeholder="例如：UID: 123456" ></div>
              <div class="admin-field"><label :for="`link-extra-${idx}`">说明</label><input :id="`link-extra-${idx}`" v-model="item.extra" placeholder="底部的小字说明" ></div>
              <div class="admin-field"><label :for="`link-url-${idx}`">跳转链接</label><input :id="`link-url-${idx}`" v-model="item.url" placeholder="https://..." ></div>
              <label class="admin-check-label"><input v-model="item.showOnHome" type="checkbox" >在首页显示此卡片</label>
            </div>
            <div class="admin-form-grid">
              <div class="admin-field"><label :for="`link-icon-${idx}`">图标字符</label><input :id="`link-icon-${idx}`" v-model="item.iconText" placeholder="B" ></div>
              <div class="admin-field">
                <label :for="`link-upload-${idx}`">上传图标（SVG / PNG）</label>
                <input :id="`link-upload-${idx}`" type="file" accept="image/svg+xml,image/png" :disabled="uploadingKey !== '' || saveLoading" @change="uploadIconFile($event, item, `home-${idx}`)" >
                <small v-if="uploadingKey === `home-${idx}`" role="status">图标上传中…</small>
              </div>
              <div class="admin-form-row">
                <label class="admin-color-field">图标背景<input v-model="item.iconBg" type="color" ></label>
                <label class="admin-color-field">图标颜色<input v-model="item.iconColor" type="color" ></label>
              </div>
              <div class="admin-color-row">
                <label class="admin-check-label"><input v-model="item.cardBgAuto" type="checkbox" >卡片底色自动适配</label>
                <label v-if="!item.cardBgAuto" class="admin-color-field">卡片底色<input v-model="item.cardBg" type="color" ></label>
              </div>
              <div class="admin-color-row">
                <label class="admin-check-label"><input v-model="item.textColorAuto" type="checkbox" >文字颜色自动适配</label>
                <label v-if="!item.textColorAuto" class="admin-color-field">文字颜色<input v-model="item.textColor" type="color" ></label>
              </div>
            </div>
          </div>
        </article>
        <p v-if="!form.links.length" class="admin-empty">暂无链接，点击“新增卡片”开始添加。</p>
      </div>
    </AdminPanel>

    <AdminPanel title="友情链接" description="管理社群链接页面的「友情链接」板块及网站页脚友链（不在首页显示；若没有友链则页脚自动隐藏）。">
      <template #actions>
        <div class="admin-row-actions">
          <button class="admin-button admin-button--secondary" :disabled="uploadingKey !== '' || saveLoading || loading || query.isError.value || form.friendLinks.length >= 50" @click="addFriendLink">新增友链</button>
          <button class="admin-button admin-button--primary" :disabled="saveLoading || uploadingKey !== '' || loading || query.isError.value" @click="saveLinks">{{ saveLoading ? '保存中…' : '保存友链' }}</button>
        </div>
      </template>
      <p v-if="loading" class="admin-empty" role="status">正在加载友链…</p>
      <div v-else-if="!form.friendLinks.length" class="admin-empty">暂无友情链接，点击“新增友链”开始添加。</div>
      <div v-else class="admin-stack">
        <article v-for="(item, idx) in form.friendLinks" :key="`friend-${idx}`" class="admin-resource-card">
          <div class="admin-resource-heading">
            <h3>{{ idx + 1 }}. {{ item.title || '未命名友链' }}</h3>
            <div class="admin-row-actions">
              <button class="admin-button admin-button--quiet" :aria-label="`上移第 ${idx + 1} 个友链`" :disabled="idx === 0 || uploadingKey !== ''" @click="moveFriendLink(idx, 'up')">上移</button>
              <button class="admin-button admin-button--quiet" :aria-label="`下移第 ${idx + 1} 个友链`" :disabled="idx === form.friendLinks.length - 1 || uploadingKey !== ''" @click="moveFriendLink(idx, 'down')">下移</button>
              <button class="admin-button admin-button--danger" :aria-label="`移除第 ${idx + 1} 个友链`" :disabled="uploadingKey !== ''" @click="removeFriendLink(idx)">移除</button>
            </div>
          </div>
          <div class="admin-link-fields">
            <div class="admin-form-grid">
              <div class="admin-field"><label :for="`friend-title-${idx}`">标题</label><input :id="`friend-title-${idx}`" v-model="item.title" placeholder="例如：友社官网" ></div>
              <div class="admin-field"><label :for="`friend-subtitle-${idx}`">副标题</label><input :id="`friend-subtitle-${idx}`" v-model="item.subtitle" placeholder="例如：高校东方同好会" ></div>
              <div class="admin-field"><label :for="`friend-extra-${idx}`">说明</label><input :id="`friend-extra-${idx}`" v-model="item.extra" placeholder="简短介绍或备注" ></div>
              <div class="admin-field"><label :for="`friend-url-${idx}`">跳转链接</label><input :id="`friend-url-${idx}`" v-model="item.url" placeholder="https://..." ></div>
            </div>
            <div class="admin-form-grid">
              <div class="admin-field"><label :for="`friend-icon-${idx}`">图标字符</label><input :id="`friend-icon-${idx}`" v-model="item.iconText" placeholder="友" ></div>
              <div class="admin-field">
                <label :for="`friend-upload-${idx}`">上传图标（SVG / PNG）</label>
                <input :id="`friend-upload-${idx}`" type="file" accept="image/svg+xml,image/png" :disabled="uploadingKey !== '' || saveLoading" @change="uploadIconFile($event, item, `friend-${idx}`)" >
                <small v-if="uploadingKey === `friend-${idx}`" role="status">图标上传中…</small>
              </div>
              <div class="admin-form-row">
                <label class="admin-color-field">图标背景<input v-model="item.iconBg" type="color" ></label>
                <label class="admin-color-field">图标颜色<input v-model="item.iconColor" type="color" ></label>
              </div>
            </div>
          </div>
        </article>
      </div>
    </AdminPanel>

    <AdminPanel title="效果预览" description="复用公开页面组件；仅预览已填写完整且有效的链接。">
      <div class="admin-stack">
        <HomeSocialLinks :links="previewLinks" />
        <div v-if="previewFriendLinks.length > 0">
          <HomeSocialLinks :links="previewFriendLinks" />
        </div>
      </div>
    </AdminPanel>
  </div>
</template>
