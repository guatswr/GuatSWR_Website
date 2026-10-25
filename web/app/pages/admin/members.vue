<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminMemberRowSchema, memberInputSchema } from '@guatswr/shared'
import type { AdminMember } from '@guatswr/shared'
import { compressUploadImage } from '~/utils/compress-image'
import AdminAvatar from '~/components/admin/Avatar.vue'
import { getThumbUrl } from '~/utils/image-url'
import { memberSyncProfileSchema,memberSyncProfileTaskSchema } from '@guatswr/shared/bot'
import MemberSyncPanel from '~/components/admin/MemberSyncPanel.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi()
const session = useBffSession()
const isSuperAdmin = session.isSuperAdmin
const showDeleted = ref(false)
const query = useQuery({ queryKey: computed(() => ['admin', 'members', showDeleted.value]), queryFn: ({ signal }) =>
  api.request({ resource: 'members', query: { includeDeleted: showDeleted.value }, signal }, value => {
    if (!Array.isArray(value)) throw new Error('成员响应无效')
    return value.map(row => adminMemberRowSchema.parse(row))
  }) })
const members = computed(() => query.data.value ?? [])
const syncProbe=useQuery({queryKey:['admin','member-sync-available'],refetchInterval:30000,queryFn:({signal})=>api.memberSync('profiles','GET',undefined,value=>{
  if(!value || typeof value!=='object' || !('available' in value) || typeof value.available!=='boolean')throw new Error('同步能力响应无效')
  return {available:value.available,items:memberSyncProfileTaskSchema.array().parse('items' in value ? value.items : [])}
},undefined,signal),retry:false})
const syncAvailable=computed(()=>syncProbe.data.value?.available===true)
const notificationIssues=computed(()=>syncProbe.data.value?.items.filter(item=>item.notification_status===null || ['failed','cancelled'].includes(item.notification_status || '') || item.message_status==='failed').length || 0)
watch(()=>syncProbe.data.value?.items.map(item=>item.id).join(','),(value,old)=>{if(old!==undefined&&value!==old)void query.refetch()})
const listLoading = query.isPending
watch(query.error, error => { if (error) ElMessage.error('加载成员失败') })
const submitLoading = ref(false)
const isEditingMember = ref(false)
const processingId = ref<number | null>(null)
const isUploadingAvatar = ref(false)
const emptyForm = () => ({ id: null as number | null, name: '', role: '', avatar: '', school: '', tags: [] as string[], sort_order: 0,qq:'',follow_group_name:false,follow_group_avatar:false,sync_protected:false,complete:true })
const memForm = reactive(emptyForm())
const tagsText = computed({ get: () => memForm.tags.join('、'), set: (value: string) => {
  memForm.tags = [...new Set(value.split(/[,，、|/]/).map(tag => tag.trim()).filter(Boolean))]
} })
const schoolOptions = [
  { value: '桂航', color: '#2B65EC', label: '桂航' }, { value: '桂电', color: '#002060', label: '桂电' },
  { value: '师大', color: '#722E87', label: '师大' }, { value: '桂师', color: '#E60012', label: '桂师' },
  { value: '桂信', color: '#F39C12', label: '桂信' }, { value: '漓院', color: '#00BFFF', label: '漓院' },
  { value: '桂理', color: '#607D8B', label: '桂理' }, { value: '桂旅', color: '#20B2AA', label: '桂旅' },
  { value: '桂医', color: '#2E8B57', label: '桂医' }, { value: '联外', color: '#800000', label: '联外' },
  { value: 'bot', color: '#424242', label: 'bot' },
]
function resetMemForm() { isEditingMember.value = false; Object.assign(memForm, emptyForm()) }
function editMember(member: AdminMember) {
  isEditingMember.value = true
  Object.assign(memForm, { ...member, tags: [...member.tags],qq:member.qq || '',follow_group_name:Boolean(member.follow_group_name),follow_group_avatar:Boolean(member.follow_group_avatar),sync_protected:Boolean(member.sync_protected),complete:member.profile_status!=='pending' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || isUploadingAvatar.value) return
  isUploadingAvatar.value = true
  try { memForm.avatar = await api.upload(await compressUploadImage(file)) }
  catch { ElMessage.error('头像上传失败') }
  finally { isUploadingAvatar.value = false; input.value = '' }
}
async function updateOrder(member: AdminMember, direction: 'up' | 'down') {
  if (processingId.value) return
  processingId.value = member.id
  try {
    await api.request({ resource: 'members', method: 'PUT', id: member.id, body: memberInputSchema.parse({ ...member, sort_order: member.sort_order + (direction === 'up' ? -1 : 1) }) }, value => value)
    await query.refetch()
  } catch { ElMessage.error('排序失败') }
  finally { processingId.value = null }
}
async function submitMember() {
  if (submitLoading.value || isUploadingAvatar.value) return
  const parsed = memberInputSchema.safeParse(memForm)
  if (!parsed.success) { ElMessage.warning(parsed.error.issues[0]?.message ?? '请检查成员信息'); return }
  const original=members.value.find(member=>member.id===memForm.id)
  const profile=memberSyncProfileSchema.safeParse({qq:memForm.qq.trim()||null,follow_group_name:memForm.follow_group_name&&(!original||original.name===memForm.name),
    follow_group_avatar:memForm.follow_group_avatar&&(!original||original.avatar===memForm.avatar),sync_protected:memForm.sync_protected,complete:memForm.complete})
  if(syncAvailable.value&&!profile.success){ElMessage.warning('请检查QQ号码和同步选项');return}
  if(syncAvailable.value&&memForm.qq&&members.value.some(member=>member.id!==memForm.id&&member.qq===memForm.qq.trim())){ElMessage.warning('该QQ已关联其他成员');return}
  submitLoading.value = true
  try {
    const result=await api.request({ resource: 'members', method: isEditingMember.value ? 'PUT' : 'POST', id: isEditingMember.value ? memForm.id ?? undefined : undefined, body: parsed.data }, value => value)
    if(!memForm.id && result && typeof result==='object' && 'id' in result && typeof result.id==='number'){memForm.id=result.id;isEditingMember.value=true}
    if(syncAvailable.value&&profile.success&&memForm.id)await api.memberSync('profile','PUT',profile.data,value=>value,memForm.id)
    resetMemForm(); await query.refetch(); ElMessage.success('提交成功')
  } catch { ElMessage.error('提交失败') }
  finally { submitLoading.value = false }
}
async function deleteMember(id: number) {
  if (processingId.value) return
  try {
    await ElMessageBox.confirm('确定删除该成员吗？', '提示', { type: 'warning' })
    processingId.value = id
    await api.request({ resource: 'members', method: 'DELETE', id }, value => value)
    await query.refetch(); ElMessage.success('删除成功')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败') }
  finally { processingId.value = null }
}
async function restoreMember(id: number) {
  if (processingId.value) return
  processingId.value = id
  try {
    await api.request({ resource: 'members', method: 'POST', id, action: 'restore' }, value => value)
    await query.refetch(); ElMessage.success('已恢复')
  } catch { ElMessage.error('恢复失败') }
  finally { processingId.value = null }
}
const search = ref('')
const pendingOnly=ref(useRoute().query.pending==='1')
const filteredMembers = computed(() => members.value.filter(member => (!pendingOnly.value || member.profile_status==='pending') && [member.qq || '',member.name, member.role, member.school, ...member.tags].join(' ').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
</script>
<template>
<div>
  <MemberSyncPanel v-if="isSuperAdmin && syncAvailable" :members="members" @applied="query.refetch();syncProbe.refetch()" />
<div class="admin-split">
    <AdminPanel :title="isEditingMember ? '编辑成员' : '添加成员'" description="更新后将同步到公开住民页面。">
      <template #actions><button v-if="isEditingMember" class="admin-button admin-button--quiet" @click="resetMemForm">取消编辑</button></template>
      <form class="admin-form-grid" @submit.prevent="submitMember">
        <div class="admin-form-row">
          <div class="admin-field"><label for="member-name">昵称 <span aria-hidden="true">*</span></label><input id="member-name" v-model="memForm.name" placeholder="用户昵称" required maxlength="50" ></div>
          <div class="admin-field"><label for="member-school">所属学校</label><select id="member-school" v-model="memForm.school"><option value="">未选择</option><option v-for="s in schoolOptions" :key="s.value" :value="s.value">{{ s.label }}</option></select></div>
        </div>
        <div class="admin-form-row">
          <div class="admin-field"><label for="member-role">外号 <span aria-hidden="true">*</span></label><input id="member-role" v-model="memForm.role" placeholder="e.g. 芋泥头" required maxlength="50" ></div>
          <div class="admin-field"><label for="member-order">排序值</label><input id="member-order" v-model.number="memForm.sort_order" type="number" step="1" ></div>
        </div>
        <div class="admin-field"><label for="member-tags">成分标签</label><input id="member-tags" v-model="tagsText" placeholder="如：STG高手、COS大手子" aria-describedby="member-tags-help" ><small id="member-tags-help">多个标签用顿号、逗号或竖线分隔。</small></div>
        <template v-if="syncAvailable">
          <div class="admin-field"><label for="member-qq">成员QQ（唯一身份）</label><input id="member-qq" v-model="memForm.qq" inputmode="numeric" maxlength="12" :disabled="Boolean(members.find(member=>member.id===memForm.id)?.qq)"><small>旧档案可关联QQ；已关联号码不可直接更换。QQ只在后台显示。</small></div>
          <label><input v-model="memForm.follow_group_name" type="checkbox"> 昵称跟随QQ群资料</label>
          <label><input v-model="memForm.follow_group_avatar" type="checkbox"> 头像跟随QQ群资料</label>
          <label><input v-model="memForm.sync_protected" type="checkbox"> 离群后仍保留公开展示</label>
          <label><input v-model="memForm.complete" type="checkbox"> 资料已核验完善</label>
          <small>手动修改昵称或头像后，将关闭对应的自动跟随。</small>
        </template>

        <div class="admin-upload-row"><AdminAvatar :src="memForm.avatar" :name="memForm.name" /><div class="admin-field"><label for="member-avatar">头像</label><input id="member-avatar" type="file" accept="image/*" :disabled="isUploadingAvatar || submitLoading" @change="handleAvatarUpload" ><small role="status">{{ isUploadingAvatar ? '头像上传中…' : '建议使用正方形图片。' }}</small></div></div>
        <button class="admin-button admin-button--primary" :disabled="submitLoading || isUploadingAvatar" type="submit">{{ submitLoading ? '提交中…' : isEditingMember ? '保存修改' : '添加成员' }}</button>
      </form>
    </AdminPanel>
    <AdminPanel title="成员列表" :description="`共 ${members.length} 位成员；公开页面按名字首字母排序。`">
      <template #actions><button v-if="isSuperAdmin" class="admin-button admin-button--secondary" :aria-pressed="showDeleted" @click="showDeleted = !showDeleted">{{ showDeleted ? '隐藏已删除' : '显示已删除' }}</button></template>
      <div class="admin-field admin-list-search"><label for="member-search">搜索成员</label><input id="member-search" v-model="search" type="search" placeholder="搜索昵称、学校或标签" ></div>
      <label v-if="syncAvailable"><input v-model="pendingOnly" type="checkbox"> 仅显示待完善资料</label>
      <p v-if="syncAvailable && notificationIssues" role="status">{{ notificationIssues }} 位成员的资料提醒尚未送达，可先处理待完善资料。</p>
      <div v-if="listLoading" class="admin-empty" role="status">正在加载成员…</div>
      <div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">加载成员失败。<button class="admin-button" @click="query.refetch()">重试</button></div>
      <div v-else-if="!filteredMembers.length" class="admin-empty">{{ search ? '没有找到匹配的成员' : '暂无成员数据' }}</div>
      <div v-else class="admin-member-list">
        <article v-for="mem in filteredMembers" :key="mem.id" data-testid="admin-member-card" class="admin-resource-card">
          <div class="admin-member-summary"><AdminAvatar :src="getThumbUrl(mem.avatar)" :name="mem.name" /><div class="admin-member-info"><h3>{{ mem.name }}</h3><p>{{ mem.role || '成员' }}<span v-if="mem.school"> · {{ mem.school }}</span></p><p v-if="mem.qq">QQ：{{ mem.qq }}</p><div class="admin-tags"><span v-if="mem.deleted_at" class="admin-badge admin-badge--danger">已删</span><span v-if="mem.profile_status==='pending'" class="admin-badge">待完善</span><span v-if="mem.sync_hidden" class="admin-badge">已离群隐藏</span><span v-for="tag in mem.tags" :key="tag" class="admin-badge">{{ tag }}</span></div></div></div>

          <div class="admin-row-actions"><template v-if="!mem.deleted_at"><button class="admin-button admin-button--secondary" title="编辑" @click="editMember(mem)">编辑</button><button class="admin-button admin-button--quiet" title="上移" :disabled="processingId !== null" @click="updateOrder(mem, 'up')">上移</button><button class="admin-button admin-button--quiet" title="下移" :disabled="processingId !== null" @click="updateOrder(mem, 'down')">下移</button><button class="admin-button admin-button--danger" title="删除" :disabled="processingId !== null" @click="deleteMember(mem.id)">删除</button></template><button v-else-if="isSuperAdmin" class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="restoreMember(mem.id)">恢复</button></div>
        </article>
      </div>
    </AdminPanel>
  </div>
  </div>
</template>
