<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage,ElMessageBox } from 'element-plus'
import { memberSyncSettingsResponseSchema,memberSyncSettingsSchema,memberSyncJobSchema,memberSyncSummarySchema } from '@guatswr/shared/bot'
import AdminPanel from './Panel.vue'
import type { AdminMember } from '@guatswr/shared'
const props=defineProps<{members:readonly AdminMember[]}>()
const api=useAdminApi()
const emit=defineEmits<{applied:[]}>()
const settings=useQuery({queryKey:['admin','member-sync-settings'],queryFn:({signal})=>api.memberSync('settings','GET',undefined,value=>memberSyncSettingsResponseSchema.parse(value),undefined,signal)})
const jobs=useQuery({queryKey:['admin','member-sync-jobs'],refetchInterval:15000,queryFn:({signal})=>api.memberSync('requests','GET',undefined,value=>{
  if(!value || typeof value!=='object' || !('items' in value))throw new Error('同步记录无效')
  return memberSyncJobSchema.array().parse(value.items)
},undefined,signal)})
const form=reactive({enabled:false,credential_id:'',groups:'',interval_minutes:360,admin_user_ids:''})
const group=ref(''),busy=ref(false),allowUnlinked=ref(false),allowDrop=ref(false)
const previewId=ref(''),previewPage=ref(1),previewSearch=ref('')
const preview=useQuery({queryKey:computed(()=>['admin','member-sync-preview',previewId.value,previewPage.value,previewSearch.value]),enabled:computed(()=>Boolean(previewId.value)),
  queryFn:({signal})=>api.memberSync('job','GET',{page:previewPage.value,search:previewSearch.value},value=>memberSyncJobSchema.parse(value),previewId.value,signal)})
const unlinkedMembers=computed(()=>props.members.filter(member=>!member.qq&&!member.deleted_at))
function inspect(id:string){previewId.value=id;previewPage.value=1;previewSearch.value=''}
async function link(qq:string,event:Event){
  const id=Number((event.target as HTMLSelectElement).value),member=props.members.find(item=>item.id===id)
  if(!member)return
  busy.value=true
  try {
    await api.memberSync('profile','PUT',{qq,follow_group_name:Boolean(member.follow_group_name),follow_group_avatar:Boolean(member.follow_group_avatar),sync_protected:Boolean(member.sync_protected),complete:member.profile_status!=='pending'},value=>value,id)
    emit('applied');await preview.refetch();ElMessage.success('QQ已关联旧档案')
  }catch{ElMessage.error('关联失败，请检查QQ是否已被使用')}
  finally{busy.value=false}
}
watch(settings.data,value=>{
  if(!value)return
  Object.assign(form,{...value.settings,credential_id:value.settings.credential_id || '',groups:value.settings.groups.join(','),admin_user_ids:value.settings.admin_user_ids.join(',')})
  group.value=value.settings.groups[0] || ''
},{immediate:true})
const split=(value:string)=>value.split(/[,，\s]+/).map(item=>item.trim()).filter(Boolean)
async function save(){
  busy.value=true
  try {
    const input=memberSyncSettingsSchema.parse({...form,credential_id:form.credential_id.trim()||null,groups:split(form.groups),admin_user_ids:split(form.admin_user_ids).map(Number)})
    await api.memberSync('settings','PUT',input,value=>memberSyncSettingsResponseSchema.parse(value))
    await Promise.all([settings.refetch(),jobs.refetch()]);ElMessage.success('同步设置已保存')
  }catch{ElMessage.error('保存失败，请检查Bot权限、群号和管理员QQ绑定')}
  finally{busy.value=false}
}
async function request(){
  busy.value=true
  try{await api.memberSync('requests','POST',{group_id:group.value.trim()},value=>memberSyncJobSchema.parse(value));await jobs.refetch();ElMessage.success('已请求Bot采集，等待完整回传')}
  catch{ElMessage.error('无法发起同步，请检查配置')}
  finally{busy.value=false}
}
async function apply(id:string){
  try{
    const answer=await ElMessageBox.prompt('请先核对成员数量和旧成员QQ关联，并填写确认理由。','确认应用群成员快照',{inputPattern:/\S+/,inputErrorMessage:'请填写核验理由'})
    busy.value=true
    await api.memberSync('apply','POST',{reason:answer.value,allow_unlinked:allowUnlinked.value,allow_large_drop:allowDrop.value},value=>memberSyncSummarySchema.parse(value),id)
    await jobs.refetch();if(previewId.value===id)previewId.value='';emit('applied');ElMessage.success('同步已应用')
  }catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error('无法应用，请完成旧成员QQ关联或核对人数异常确认项')}
  finally{busy.value=false}
}
const labels:Record<string,string>={queued:'等待采集',collecting:'正在回传',preview:'待首次核验',blocked:'人数异常待确认',succeeded:'同步成功',failed:'失败',expired:'已超时',applying:'应用中'}
const needsReview=computed(()=>jobs.data.value?.some(job=>['preview','blocked'].includes(job.status)) || false)
const visibleJobs=computed(()=>{
  const list=jobs.data.value || []
  const pending=list.filter(job=>['queued','collecting','preview','blocked','applying'].includes(job.status))
  return [...pending,...list.filter(job=>!pending.includes(job)).slice(0,5)]
})
const jobSummary=(job:ReturnType<typeof memberSyncJobSchema.parse>)=>preview.data.value?.id===job.id?preview.data.value.summary:job.summary
</script>
<template>
  <AdminPanel title="QQ群成员同步" description="按QQ匹配成员；学校、外号、标签和排序由后台维护。">
    <p v-if="settings.isError.value || jobs.isError.value" role="alert">同步信息暂时无法读取。<button class="admin-button" @click="settings.refetch();jobs.refetch()">重试</button></p>
    <details>
      <summary class="admin-button admin-button--quiet">配置同步与手动采集</summary>
    <form class="admin-form-grid" @submit.prevent="save">
      <label><input v-model="form.enabled" type="checkbox"> 启用定时采集</label>
      <div class="admin-field"><label for="sync-bot-id">Bot服务凭据ID</label><input id="sync-bot-id" v-model="form.credential_id" required><small>需授予 members:sync、deliveries:ack 及受管群权限。</small></div>
      <div class="admin-field"><label for="sync-groups">受管QQ群号</label><input id="sync-groups" v-model="form.groups" required><small>逗号分隔；排在前面的群优先提供展示名。</small></div>
      <div class="admin-field"><label for="sync-admins">私信接收管理员的站内ID</label><input id="sync-admins" v-model="form.admin_user_ids" required><small>需已将管理员账号与此Bot的QQ身份绑定。</small></div>
      <div class="admin-field"><label for="sync-interval">采集间隔（分钟）</label><input id="sync-interval" v-model.number="form.interval_minutes" type="number" min="30" max="10080"></div>
      <button class="admin-button admin-button--primary" :disabled="busy || settings.isPending.value">保存设置</button>
    </form>
    <form class="admin-form-grid" @submit.prevent="request">
      <div class="admin-field"><label for="sync-manual-group">手动采集群号</label><input id="sync-manual-group" v-model="group" required></div>
      <button class="admin-button admin-button--secondary" :disabled="busy">立即请求采集</button>
    </form>
    </details>
    <p>首次快照需核验后应用；旧成员不会按昵称自动合并。资料待完善任务不因私信失败而丢失。</p>
    <details :open="needsReview">
      <summary class="admin-button admin-button--quiet">{{ needsReview ? '有快照待核验' : '查看同步记录' }}</summary>
      <div v-if="needsReview" class="admin-form-grid">
        <label><input v-model="allowUnlinked" type="checkbox"> 已核对并保留尚未关联QQ的旧档案</label>
        <label><input v-model="allowDrop" type="checkbox"> 已人工确认空名单或成员数大幅下降</label>
      </div>
    <article v-for="job in visibleJobs" :key="job.id" class="admin-resource-card">
      <p>群 {{ job.group_id }} · {{ labels[job.status] || job.status }}</p>
      <p v-if="jobSummary(job)">{{ jobSummary(job)?.count }} 人，新增 {{ jobSummary(job)?.new_count }} 人，旧档案未关联 {{ jobSummary(job)?.unlinked_count }} 人</p>
      <button v-if="['preview','blocked'].includes(job.status)" class="admin-button admin-button--secondary" @click="inspect(job.id)">查看名单与关联QQ</button>
      <button v-if="['preview','blocked'].includes(job.status)" class="admin-button" :disabled="busy" @click="apply(job.id)">核验并应用</button>
    </article>
    </details>
    <section v-if="previewId" class="admin-form-grid" aria-label="群名册对照">
      <div class="admin-field"><label for="sync-preview-search">按QQ或群名片查找</label><input id="sync-preview-search" v-model="previewSearch" maxlength="50" @input="previewPage=1"></div>
      <p v-if="preview.data.value?.summary">当前预计新增 {{ preview.data.value.summary.new_count }} 人，旧档案未关联 {{ preview.data.value.summary.unlinked_count }} 人</p>
      <p v-if="preview.isError.value" role="alert">名单读取失败，请重新选择同步记录。</p>
      <article v-for="person in preview.data.value?.preview?.items || []" :key="person.qq" class="admin-resource-card">
        <p>{{ person.group_card || person.nickname || '未命名群友' }} · QQ {{ person.qq }}</p>
        <p v-if="person.matched_member_id">已关联：{{ person.website_name }}</p>
        <div v-else class="admin-field"><label :for="`sync-link-${person.qq}`">为 QQ {{ person.qq }} 选择旧档案</label>
          <select :id="`sync-link-${person.qq}`" :disabled="busy" @change="link(person.qq,$event)"><option value="">新成员可直接随快照创建；旧成员请选择</option><option v-for="member in unlinkedMembers" :key="member.id" :value="member.id">{{ member.name }} · {{ member.school || '未填写学校' }}</option></select>
        </div>
      </article>
      <div><button class="admin-button" :disabled="previewPage<=1" @click="previewPage--">上一页</button><button class="admin-button" :disabled="!preview.data.value?.preview?.has_more" @click="previewPage++">下一页</button><button class="admin-button admin-button--quiet" @click="previewId=''">关闭对照</button></div>
    </section>
  </AdminPanel>
</template>
