<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { botCredentialSchema, botScopes, botCredentialCreatedSchema, botCredentialListSchema, botCredentialSecretSchema } from '@guatswr/shared/bot'
import { botScopeLabels } from '#shared/bot-admin'
import AdminPanel from '~/components/admin/Panel.vue'

const api = useAdminApi(), session = useBffSession()
const vaultEnabled = ref(false), search = ref(''), status = ref('all')
const credentials = useQuery({ queryKey: ['admin', 'bot-credentials'], retry: false,
  queryFn: ({ signal }) => api.botCredentials('GET', undefined, value => { const data = botCredentialListSchema.parse(value); vaultEnabled.value = data.vault_enabled; return data.items }, undefined, signal) })
const form = reactive({ name: '', scopes: ['query:read'] as (typeof botScopes[number])[], groups: '' })
const busy = ref(false), secret = shallowRef<ReturnType<typeof botCredentialCreatedSchema.parse> | null>(null)
const secretDialog = ref<HTMLDialogElement | null>(null)
const allScopes = computed({ get: () => form.scopes.length === botScopes.length, set: (checked: boolean) => { form.scopes = checked ? [...botScopes] : [] } })
const filteredCredentials = computed(() => (credentials.data.value || []).filter(item => (status.value === 'all' || (status.value === 'active' ? item.revoked_at === null : item.revoked_at !== null)) && `${item.name} ${item.id} ${item.groups.join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase())))
let hideTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const clearSecret = () => { secretDialog.value?.close(); secret.value = null; clearTimeout(hideTimer); hideTimer = undefined }
function showSecret(value: NonNullable<typeof secret.value>) {
  clearSecret(); secret.value = value; hideTimer = setTimeout(clearSecret, 60000)
  void nextTick(() => { if (secret.value && secretDialog.value && !secretDialog.value.open) secretDialog.value.showModal() })
}
const hideWhenBackground = () => { if (document.hidden) clearSecret() }
onMounted(() => { window.addEventListener('blur', clearSecret); document.addEventListener('visibilitychange', hideWhenBackground) })
onBeforeUnmount(() => { window.removeEventListener('blur', clearSecret); document.removeEventListener('visibilitychange', hideWhenBackground) })
const unregister = session.registerPrivateCleanup(clearSecret)
onScopeDispose(() => { disposed = true; unregister(); clearSecret() })
async function create() {
  if (busy.value) return
  if (secret.value) { ElMessage.warning('请先保存并关闭当前密钥'); return }
  const parsed = botCredentialSchema.safeParse({ ...form, groups: form.groups.split(/[,，\s]+/).filter(Boolean) })
  if (!parsed.success) { ElMessage.warning('请填写名称、至少一项权限及有效的群号'); return }
  busy.value = true
  try {
    const result = await api.botCredentials('POST', parsed.data, value => botCredentialCreatedSchema.parse(value))
    if (disposed) return
    showSecret(result)
    form.name = ''; form.groups = ''; form.scopes = ['query:read']
    await credentials.refetch()
  } catch { if (!disposed) ElMessage.error('创建未确认，请刷新列表检查后再操作；如已创建但密钥遗失，请撤销后重新创建') }
  finally { busy.value = false }
}
async function copy() {
  if (!secret.value) return
  try { await navigator.clipboard.writeText(secret.value.token); ElMessage.success('密钥已复制') }
  catch { ElMessage.warning('无法自动复制，请手动选择并复制密钥') }
}
async function reveal(credential: NonNullable<typeof credentials.data.value>[number]) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await api.botCredentials('REVEAL', {}, value => botCredentialSecretSchema.parse(value), credential.id)
    if (!disposed) showSecret({ ...credential, token: result.token })
  } catch { if (!disposed) ElMessage.error('无法读取密钥，请检查加密配置；旧密钥需重新创建') }
  finally { busy.value = false }
}
async function revoke(id: string, name: string) {
  if (busy.value) return
  try {
    await ElMessageBox.confirm(`撤销“${name}”后，使用此凭据的接口请求和成员同步将失效。`, '撤销 Bot API 凭据', { type: 'warning', confirmButtonText: '撤销凭据', cancelButtonText: '取消' })
    busy.value = true
    await api.botCredentials('DELETE', {}, value => value, id)
    if (secret.value?.id === id) clearSecret()
    await credentials.refetch(); ElMessage.success('凭据已撤销')
  } catch (error) { if (error !== 'cancel' && error !== 'close' && !disposed) ElMessage.error('撤销失败，请刷新后重试') }
  finally { busy.value = false }
}
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const scopeNames = (scopes: (typeof botScopes[number])[]) => scopes.map(scope => botScopeLabels[scope]).join('、')
</script>

<template>
  <div v-if="session.isSuperAdmin.value" class="admin-stack">
    <AdminPanel title="创建 Bot API 凭据" description="由站长手动创建，按用途授予权限，再将密钥填写到 AstrBot 插件。">
      <p v-if="credentials.isError.value" role="alert">无法读取 Bot API。请检查后端是否启用 BOT_PLATFORM_ENABLED 并完成数据库迁移。<button class="admin-button" @click="credentials.refetch()">重试</button></p>
      <dialog v-if="secret" ref="secretDialog" class="bot-secret-dialog" aria-labelledby="bot-secret-heading" @cancel.prevent="clearSecret">
        <h2 id="bot-secret-heading">Bot API 密钥</h2>
        <h3>{{ vaultEnabled ? '查看 Bot API 密钥' : '密钥仅显示一次' }}</h3>
        <p>{{ secret.name }} · 60 秒后自动隐藏，切换窗口或离开页面也会隐藏。</p>
        <p v-if="!vaultEnabled">当前未启用加密保存，请妥善保存；关闭后无法再次查看。</p>
        <div class="admin-field"><label for="bot-created-token">Bot API 密钥</label><input id="bot-created-token" class="bot-secret-input" :value="secret.token" readonly autocomplete="off" spellcheck="false" @focus="($event.target as HTMLInputElement).select()"></div>
        <p>凭据 ID：{{ secret.id }}</p>
        <div class="bot-secret-actions"><button class="admin-button admin-button--primary" @click="copy">复制密钥</button>
        <button class="admin-button admin-button--secondary" @click="clearSecret">已保存，关闭密钥</button>
        </div>
      </dialog>
      <form class="admin-form-grid" @submit.prevent="create">
        <div class="admin-field"><label for="bot-name">凭据名称</label><input id="bot-name" v-model="form.name" maxlength="80" required placeholder="例如：社群 AstrBot"></div>
        <fieldset class="admin-field"><legend>接口权限</legend>
          <div class="admin-row-actions"><label class="admin-check-label"><input v-model="allScopes" type="checkbox" :indeterminate="form.scopes.length > 0 && !allScopes">全选所有权限</label><span class="admin-hint">已选 {{ form.scopes.length }} / {{ botScopes.length }}</span><button type="button" class="admin-button admin-button--quiet" @click="form.scopes = ['query:read']">仅公开查询</button><button type="button" class="admin-button admin-button--quiet" @click="form.scopes = ['query:read','members:sync','deliveries:ack','identity:write']">群成员同步</button><button type="button" class="admin-button admin-button--quiet" @click="form.scopes = []">清空</button></div>
          <div class="bot-scope-list">
          <label v-for="scope in botScopes" :key="scope" class="admin-check-label"><input v-model="form.scopes" type="checkbox" :value="scope"> {{ botScopeLabels[scope] }}</label>
          </div>
        </fieldset>
        <div class="admin-field"><label for="bot-groups">授权QQ群号</label><textarea id="bot-groups" v-model="form.groups" rows="2" placeholder="多个群号用逗号或换行分隔" /><small>仅查询公开内容时可留空；成员同步和群订阅需填写对应群号。</small></div>
        <p>群成员同步需同时勾选「回传群成员和头像」及「确认私信投递结果」。</p>
        <button class="admin-button admin-button--primary" :disabled="busy || !!secret || credentials.isPending.value || credentials.isError.value">创建凭据</button>
      </form>
    </AdminPanel>
    <AdminPanel title="已创建的凭据" description="密钥默认隐藏；仅站长可按需查看，每次查看均记录审计。最多显示最近 100 条。">
      <div class="admin-filter-bar"><div class="admin-field"><label for="bot-search">查找凭据</label><input id="bot-search" v-model="search" placeholder="名称、凭据 ID 或群号"></div><div class="admin-field"><label for="bot-status">凭据状态</label><select id="bot-status" v-model="status"><option value="all">全部状态</option><option value="active">有效</option><option value="revoked">已撤销</option></select></div></div>
      <p v-if="!vaultEnabled" class="admin-notice">服务未启用密钥加密保存，新建密钥仅显示一次。历史上只保存摘要的密钥无法还原。</p>
      <p v-if="credentials.isPending.value">正在读取凭据…</p>
      <p v-else-if="!credentials.isError.value && !credentials.data.value?.length">尚未创建凭据。请由站长在上方手动创建。</p>
      <p v-if="!credentials.isPending.value && credentials.data.value?.length && !filteredCredentials.length" class="admin-empty">没有匹配的凭据，请调整筛选。</p>
      <article v-for="credential in filteredCredentials" :key="credential.id" class="admin-resource-card" data-testid="bot-credential-card">
        <h3>{{ credential.name }} · {{ credential.revoked_at === null ? '有效' : '已撤销' }}</h3>
        <p>凭据 ID：{{ credential.id }}</p>
        <p>权限：{{ scopeNames(credential.scopes) }}</p>
        <p>授权群：{{ credential.groups.join('、') || '无' }} · 创建于 {{ date(credential.created_at) }}</p>
        <p class="admin-hint">Token：gwb_•••••••• · {{ credential.secret_available ? '已加密保存' : credential.revoked_at ? '已失效' : '仅有摘要，无法还原' }}</p>
        <button v-if="credential.secret_available" class="admin-button admin-button--secondary" :disabled="busy" @click="reveal(credential)">查看 Token</button>
        <button v-if="credential.revoked_at === null" class="admin-button" :disabled="busy" @click="revoke(credential.id, credential.name)">撤销</button>
      </article>
      <NuxtLink class="admin-button admin-button--quiet" to="/admin/bot?section=sync">配置群成员同步</NuxtLink>
    </AdminPanel>
  </div>
</template>

<style scoped>
.bot-scope-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 4px 16px; }
.bot-secret-dialog { margin: auto; padding: 24px; width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; border: 1px solid var(--admin-border); border-radius: 12px; background: var(--admin-surface); color: var(--admin-text); }
.bot-secret-dialog::backdrop { background: rgba(0, 0, 0, .65); }
.bot-secret-dialog h2 { font-size: 18px; font-weight: 650; }
.bot-secret-dialog p { margin: 12px 0; overflow-wrap: anywhere; }
.bot-secret-input { width: 100%; min-height: 44px; margin: 8px 0; border: 1px solid var(--admin-border); border-radius: 6px; padding: 10px; background: var(--admin-soft); color: var(--admin-text); font-family: monospace; }
.bot-secret-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
</style>
