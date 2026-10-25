<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { memberSyncProfileSchema, type memberSyncProfileTaskSchema } from '@guatswr/shared/bot'
import type { AdminMember } from '@guatswr/shared'
import { botMemberId, botPageLink } from '~/utils/admin-bot'
import AdminPanel from './Panel.vue'
const props = defineProps<{ members: readonly AdminMember[]; tasks: readonly ReturnType<typeof memberSyncProfileTaskSchema.parse>[]; loading: boolean; failed: boolean }>()
const emit = defineEmits<{ updated: []; retry: [] }>()
const api = useAdminApi(), route = useRoute(), router = useRouter()
const search = ref(''), busy = ref(false)
const selectedId = computed(() => botMemberId(route.query.member))
const selected = computed(() => props.members.find(member => member.id === selectedId.value && !member.deleted_at))
const tasks = computed(() => props.tasks.filter(item => `${item.name} ${item.qq || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const form = reactive({ qq: '', follow_group_name: false, follow_group_avatar: false, sync_protected: false, complete: false })
watch(selected, member => {
  if (member) Object.assign(form, { qq: member.qq || '', follow_group_name: Boolean(member.follow_group_name), follow_group_avatar: Boolean(member.follow_group_avatar), sync_protected: Boolean(member.sync_protected), complete: member.profile_status !== 'pending' })
}, { immediate: true })
function choose(event: Event) { const id = botMemberId((event.target as HTMLSelectElement).value); void router.push(botPageLink('profiles', id)) }
async function save() {
  if (!selected.value || busy.value) return
  const parsed = memberSyncProfileSchema.safeParse({ ...form, qq: form.qq.trim() || null })
  if (!parsed.success) { ElMessage.warning('请检查 QQ 号码及同步选项'); return }
  busy.value = true
  try { await api.memberSync('profile', 'PUT', parsed.data, value => value, selected.value.id); emit('updated'); ElMessage.success('Bot 成员设置已保存') }
  catch { ElMessage.error('保存失败，请检查 QQ 是否已被其他成员使用') }
  finally { busy.value = false }
}
const notice = (task: typeof props.tasks[number]) => task.message_status === 'sent' ? '私信已送达' : task.message_status === 'failed' || ['failed', 'cancelled'].includes(task.notification_status || '') ? '提醒未送达' : '提醒处理中'
</script>
<template>
  <div class="admin-split admin-split--balanced">
    <AdminPanel title="Bot 成员设置" description="集中管理 QQ 关联、资料跟随和核验状态。">
      <p v-if="failed" class="admin-notice admin-notice--error" role="alert">成员读取失败。<button class="admin-button" @click="emit('retry')">重试</button></p>
      <div class="admin-field"><label for="bot-profile-member">选择成员</label><select id="bot-profile-member" :value="selectedId || ''" :disabled="loading || busy" @change="choose"><option value="">请选择需要处理的成员</option><option v-for="member in members.filter(item => !item.deleted_at)" :key="member.id" :value="member.id">{{ member.name }}{{ member.qq ? ` · ${member.qq}` : '' }}</option></select></div>
      <form v-if="selected" class="admin-form-grid" @submit.prevent="save">
        <h3>{{ selected.name }}</h3>
        <div class="admin-field"><label for="bot-profile-qq">成员QQ（唯一身份）</label><input id="bot-profile-qq" v-model="form.qq" inputmode="numeric" maxlength="12" :disabled="Boolean(selected.qq)"><small>已关联的 QQ 不可直接更换。QQ 仅在后台显示。</small></div>
        <label class="admin-check-label"><input v-model="form.follow_group_name" type="checkbox">昵称跟随QQ群资料</label>
        <label class="admin-check-label"><input v-model="form.follow_group_avatar" type="checkbox">头像跟随QQ群资料</label>
        <label class="admin-check-label"><input v-model="form.sync_protected" type="checkbox">离群后仍保留公开展示</label>
        <label class="admin-check-label"><input v-model="form.complete" type="checkbox">资料已核验完善</label>
        <div class="admin-row-actions"><button class="admin-button admin-button--primary" :disabled="busy">{{ busy ? '保存中…' : '保存 Bot 成员设置' }}</button><NuxtLink class="admin-button admin-button--secondary" :to="`/admin/members?edit=${selected.id}`">编辑网站资料</NuxtLink></div>
        <small>昵称、学校和标签在住民管理维护；手动修改昵称或头像会关闭对应的自动跟随。</small>
      </form>
      <p v-else class="admin-empty">从列表选择成员，或打开右侧资料待办。</p>
    </AdminPanel>
    <AdminPanel title="资料待办" :description="`最新 ${tasks.length} 条待完善任务，私信失败不会丢失待办。`">
      <div class="admin-field"><label for="bot-profile-search">查找待办</label><input id="bot-profile-search" v-model="search" placeholder="成员昵称或 QQ"></div>
      <p v-if="loading" class="admin-empty" role="status">正在读取资料任务…</p>
      <p v-else-if="!tasks.length" class="admin-empty">暂无匹配的待办。</p>
      <article v-for="task in tasks" :key="task.id" class="admin-resource-card"><h3>{{ task.name }} · {{ task.qq || '未关联QQ' }}</h3><p class="admin-hint">{{ notice(task) }}</p><NuxtLink class="admin-button admin-button--secondary" :to="botPageLink('profiles', task.id)">处理资料</NuxtLink></article>
    </AdminPanel>
  </div>
</template>
