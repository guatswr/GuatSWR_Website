<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { botDeliveryListSchema } from '@guatswr/shared/bot'
import AdminPanel from './Panel.vue'
const api=useAdminApi(), page=ref(1), busy=ref('')
const query=useQuery({queryKey:computed(()=>['admin','bot-deliveries',page.value]),refetchInterval:15000,queryFn:({signal})=>api.botDeliveries('GET',{page:page.value},value=>botDeliveryListSchema.parse(value),signal)})
const labels:Record<string,string>={pending:'等待投递',sending:'投递中',sent:'HTTP 已接收',failed:'失败',skipped:'未发送',cancelled:'已取消'}
const statusLabel=(value:string)=>labels[value] || value
async function retry(id:string){
  if(busy.value)return
  busy.value=id
  try{await api.botDeliveries('POST',{id},value=>value);await query.refetch();ElMessage.success('已重新排队，等待投递')}
  catch{ElMessage.error('无法重试，任务状态可能已变化，请刷新后查看')}
  finally{busy.value=''}
}
</script>
<template>
  <AdminPanel title="Bot 通知投递" description="HTTP 接收与私信实际送达分别显示；失败或未发送任务可手动重试。">
    <template #actions><button class="admin-button admin-button--secondary" :disabled="query.isFetching.value" @click="query.refetch()">刷新投递记录</button></template>
    <p v-if="query.isPending.value" class="admin-empty" role="status">正在读取投递记录…</p>
    <p v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">无法读取投递记录。<button class="admin-button" @click="query.refetch()">重试</button></p>
    <p v-else-if="!query.data.value?.items.length" class="admin-empty">暂无投递记录。</p>
    <div v-else class="admin-table-scroll"><table class="admin-table"><thead><tr><th scope="col">事件 / 任务</th><th scope="col">目标</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody><tr v-for="item in query.data.value.items" :key="item.id"><td>{{ item.event_name }}<small class="admin-hint">{{ item.id }}</small></td><td>{{ item.target_type === 'private' ? '管理员私信' : item.target_type === 'service' ? 'Bot 服务' : item.group_id ? `群 ${item.group_id}` : '默认 Webhook' }}</td><td>{{ statusLabel(item.status) }} · {{ item.attempts }} 次<p v-if="item.target_type === 'private'">私信：{{ item.message_status === 'sent' ? '已送达' : item.message_status === 'failed' ? '未送达' : '等待回执' }}</p><p v-if="item.last_error" class="admin-hint">{{ item.last_error }}</p></td><td><button v-if="['failed','skipped'].includes(item.status)" class="admin-button admin-button--secondary" :disabled="Boolean(busy)" @click="retry(item.id)">重试投递</button></td></tr></tbody></table></div>
    <nav class="admin-pagination" aria-label="Bot 投递分页"><button class="admin-button admin-button--secondary" :disabled="page<=1 || query.isFetching.value" @click="page--">上一页</button><span>第 {{ page }} 页</span><button class="admin-button admin-button--secondary" :disabled="(query.data.value?.items.length || 0)<20 || query.isFetching.value" @click="page++">下一页</button></nav>
  </AdminPanel>
</template>
