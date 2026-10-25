<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { adminActivityRowSchema,activityRevisionListSchema,activityRevisionDetailSchema,activityRevisionRestoreResultSchema } from '@guatswr/shared'
const props=defineProps<{activityId:number;allowRestore:boolean}>()
const emit=defineEmits<{close:[];changed:[]}>()
const notice=ref('')
const api=useAdminApi(),dialog=ref<HTMLDialogElement|null>(null),page=ref(1),selected=ref<number|null>(null),busy=ref(false),confirming=ref(false),error=ref('')
const list=useQuery({queryKey:computed(()=>['admin','article-revisions',props.activityId,page.value]),queryFn:({signal})=>api.articleRevisions('GET',{id:props.activityId,page:page.value},value=>activityRevisionListSchema.parse(value),signal)})
const current=useQuery({queryKey:computed(()=>['admin','article-revision-current',props.activityId]),queryFn:({signal})=>api.request({resource:'activities',id:props.activityId,signal},value=>adminActivityRowSchema.parse(value))})
const detail=useQuery({queryKey:computed(()=>['admin','article-revision-detail',props.activityId,selected.value]),enabled:computed(()=>Boolean(selected.value)),queryFn:({signal})=>api.articleRevisions('GET',{id:props.activityId,revision:selected.value!},value=>activityRevisionDetailSchema.parse(value),signal)})
const labels:Record<string,string>={baseline:'基线快照',create:'创建',update:'保存',restore:'恢复历史版本'}
const fields=[{key:'title',label:'标题'},{key:'tag',label:'标签'},{key:'date',label:'日期'},{key:'description',label:'摘要'},{key:'content',label:'正文'},{key:'cover_image',label:'封面'},{key:'images',label:'相册'}] as const
const differences=computed(()=>fields.filter(field=>JSON.stringify(detail.data.value?.[field.key]??'')!==JSON.stringify(current.data.value?.[field.key]??'')))
const canRestore=computed(()=>props.allowRestore && !current.data.value?.deleted_at && Boolean(detail.data.value) && !current.isPending.value && !current.isError.value && !busy.value)
const time=(value:number)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})
function choose(id:number){selected.value=id;confirming.value=false;error.value=''}
onMounted(()=>dialog.value?.showModal())
onBeforeUnmount(()=>dialog.value?.close())
function close(){if(!busy.value)emit('close')}
async function restore(){
  if(!canRestore.value || !selected.value || !list.data.value?.current_revision)return
  busy.value=true;error.value=''
  try{
    const result=await api.articleRevisions('POST',{id:props.activityId,revision:selected.value,base_revision:list.data.value.current_revision},value=>activityRevisionRestoreResultSchema.parse(value))
    await Promise.all([list.refetch(),current.refetch()]);confirming.value=false;emit('changed')
    notice.value=result.restored?'已恢复为新修订，历史记录已保留':'与当前内容一致，无需恢复'
    ElMessage.success(notice.value)
  }catch(failure){
    if(failure && typeof failure==='object' && 'status' in failure && failure.status===409){await Promise.all([list.refetch(),current.refetch()]);error.value='文章已有新修订或状态已改变。已刷新，请重新核对后确认。'}
    else { await Promise.all([list.refetch(),current.refetch()]);error.value='恢复结果未确认，已刷新当前内容与修订记录，请核对后再决定是否重试。' }
    emit('changed')
    confirming.value=false
  }finally{busy.value=false}
}
</script>
<template>
  <dialog ref="dialog" class="revision-dialog" aria-labelledby="revision-heading" @cancel.prevent="close">
    <header class="revision-heading"><div><h2 id="revision-heading">文章修订记录</h2><p>文章 #{{ activityId }} · 共 {{ list.data.value?.total || 0 }} 个版本。基线仅代表功能启用时保存的内容。</p></div><button class="admin-button admin-button--secondary" :disabled="busy" @click="close">关闭修订记录</button></header>
    <p v-if="list.isError.value" class="admin-notice admin-notice--error" role="alert">修订记录读取失败，请确认后端已升级到 main7。<button class="admin-button" @click="list.refetch()">重试</button></p>
    <p v-if="list.isPending.value" role="status">正在读取修订记录…</p>
    <div v-else class="revision-layout">
      <aside aria-label="历史版本"><p v-if="!list.data.value?.items.length">暂无修订记录；下次保存时将开始记录。</p><ol><li v-for="item in list.data.value?.items || []" :key="item.id"><button class="revision-item" :class="{'is-selected':selected===item.id}" :aria-pressed="selected===item.id" :disabled="busy" @click="choose(item.id)"><strong>版本 {{ item.version }} · {{ labels[item.action] }}</strong><span>{{ item.actor_name }} · {{ time(item.created_at) }}</span><span v-if="item.id===list.data.value?.current_revision">当前保存版本</span><span v-if="item.restored_from">来源修订 #{{ item.restored_from }}</span></button></li></ol><nav class="admin-row-actions" aria-label="修订分页"><button class="admin-button" :disabled="page<=1 || busy" @click="page--">上一页</button><span>{{ page }}</span><button class="admin-button" :disabled="page*20>=(list.data.value?.total||0) || busy" @click="page++">下一页</button></nav></aside>
      <section class="revision-detail" aria-label="版本内容对照">
        <p v-if="!selected" class="admin-empty">选择一个版本，查看内容及与当前保存内容的区别。</p>
        <p v-else-if="detail.isPending.value" role="status">正在读取版本内容…</p>
        <p v-else-if="detail.isError.value" role="alert">版本内容读取失败。<button class="admin-button" @click="detail.refetch()">重试</button></p>
        <template v-else-if="detail.data.value">
          <h3>版本 {{ detail.data.value.version }} · {{ detail.data.value.title || '未命名' }}</h3>
          <p class="admin-hint">{{ detail.data.value.actor_name }} · {{ time(detail.data.value.created_at) }} · {{ detail.data.value.source_status==='draft'?'草稿':'已发布' }}</p>
          <p v-if="current.isError.value" role="alert">当前文章读取失败，暂时无法比较或恢复。</p><p v-else-if="current.isPending.value" role="status">正在读取当前内容…</p><p v-else>与当前不同：{{ differences.map(field=>field.label).join('、') || '内容一致' }}</p>
          <div class="revision-columns"><div><h4>历史内容</h4><p>{{ detail.data.value.tag }} · {{ detail.data.value.date }}</p><p>{{ detail.data.value.description }}</p><pre>{{ detail.data.value.content || '（正文为空）' }}</pre><p>封面：{{ detail.data.value.cover_image || '无' }}</p><img v-if="detail.data.value.cover_image?.startsWith('/uploads/')" :src="detail.data.value.cover_image" alt="历史封面" class="admin-image-preview"><p>相册 {{ detail.data.value.images.length }} 张</p><pre v-if="detail.data.value.images.length">{{ detail.data.value.images.join('\n') }}</pre><div class="revision-images"><img v-for="image in detail.data.value.images.filter(url=>url.startsWith('/uploads/'))" :key="image" :src="image" alt="历史相册配图" loading="lazy"></div></div><div><h4>当前保存内容</h4><p>{{ current.data.value?.title }}</p><p>{{ current.data.value?.tag }} · {{ current.data.value?.date }}</p><p>{{ current.data.value?.description }}</p><pre>{{ current.data.value?.content || '（正文为空）' }}</pre><p>封面：{{ current.data.value?.cover_image || '无' }}</p><img v-if="current.data.value?.cover_image?.startsWith('/uploads/')" :src="current.data.value.cover_image" alt="当前封面" class="admin-image-preview"><p>相册 {{ current.data.value?.images.length || 0 }} 张</p><pre v-if="current.data.value?.images.length">{{ current.data.value.images.join('\n') }}</pre><div class="revision-images"><img v-for="image in current.data.value?.images.filter(url=>url.startsWith('/uploads/')) || []" :key="image" :src="image" alt="当前相册配图" loading="lazy"></div></div></div>
          <p v-if="!allowRestore" class="admin-notice">编辑器中有未保存内容，请先保存或返回列表，再恢复历史版本。</p><p v-else-if="current.data.value?.deleted_at" class="admin-notice">请先从回收站恢复文章，再恢复历史版本。</p>
          <p v-if="error" class="admin-notice admin-notice--error" role="alert">{{ error }}</p>
          <p v-if="notice" class="admin-notice" role="status">{{ notice }}</p>
          <div v-if="confirming" class="admin-notice"><p>确认用版本 {{ detail.data.value.version }} 的内容替换当前内容？操作将生成新修订，保留当前发布状态，也保留已有历史记录。</p><div class="admin-row-actions"><button class="admin-button admin-button--primary" :disabled="!canRestore" @click="restore">{{ busy?'恢复中…':'确认恢复此版本' }}</button><button class="admin-button" :disabled="busy" @click="confirming=false">取消恢复</button></div></div>
          <button v-else class="admin-button admin-button--primary" :disabled="!canRestore || !differences.length" @click="confirming=true">恢复此版本</button>
        </template>
      </section>
    </div>
  </dialog>
</template>
<style scoped>
.revision-dialog{margin:auto;width:min(1100px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:1px solid var(--admin-border);border-radius:12px;background:var(--admin-surface);color:var(--admin-text)}
.revision-dialog::backdrop{background:rgba(0,0,0,.65)}
.revision-heading{display:flex;gap:16px;align-items:start;justify-content:space-between;margin-bottom:20px}.revision-heading h2{font-size:20px;font-weight:650}.revision-heading p{font-size:12px;color:var(--admin-muted)}
.revision-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px}.revision-item{display:grid;width:100%;gap:6px;padding:12px;text-align:left;border:1px solid var(--admin-border);border-radius:8px;margin-bottom:10px}.revision-item span{font-size:11px;color:var(--admin-muted)}.revision-item.is-selected{border-color:var(--admin-primary);background:var(--admin-active)}
.revision-detail{min-width:0;display:grid;gap:16px;align-content:start}.revision-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.revision-columns>div{min-width:0}.revision-columns h4{font-weight:650}.revision-columns p{font-size:12px;overflow-wrap:anywhere;margin:8px 0}.revision-columns pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;background:var(--admin-soft);padding:12px;border-radius:8px;font-size:12px}.revision-images{display:flex;flex-wrap:wrap;gap:8px}.revision-images img{width:80px;height:80px;object-fit:cover}
@media(max-width:760px){.revision-layout,.revision-columns{grid-template-columns:1fr}.revision-layout aside{max-height:240px;overflow:auto}.revision-heading{flex-wrap:wrap}}
</style>
