<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage } from '../../utils/image'
import EventCard from '../../components/events/EventCard.vue'
import EventForm from '../../components/events/EventForm.vue'

const activeTab = ref('pending')
const pendingItems = ref([])
const allItems = ref([])
const loading = ref(false)

const settleDialogOpen = ref(false)
const resultDialogOpen = ref(false)
const publishDialogOpen = ref(false)
const participantsDialogOpen = ref(false)
const currentEvent = ref(null)
const resultFileInput = ref(null)
const uploadIndex = ref(null)
const uploading = ref(false)
const uploadPercent = ref(0)
const participantsLoading = ref(false)
const participantsItems = ref([])

const settleForm = ref({
  completion_id: '',
  completion_avatar: '',
  completion_time: '',
  result: ''
})

const resultRows = ref([
  { rank: 1, id: '', avatar: '' },
  { rank: 2, id: '', avatar: '' },
  { rank: 3, id: '', avatar: '' }
])

const fetchPending = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/event/admin/list', { params: { status: 'pending', limit: 50 } })
    pendingItems.value = res.data?.items || []
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    loading.value = false
  }
}

const fetchAll = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/event/admin/list', {
      params: { status: 'published,ongoing,ended,settled,pending', limit: 50 }
    })
    allItems.value = res.data?.items || []
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    loading.value = false
  }
}

const refresh = () => {
  if (activeTab.value === 'pending') return fetchPending()
  return fetchAll()
}

const approveEvent = async (event) => {
  try {
    await axios.post(`/api/event/${event.id}/approve`)
    ElMessage.success('已通过审核')
    refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  }
}

const rejectEvent = async (event) => {
  try {
    await axios.post(`/api/event/${event.id}/reject`)
    ElMessage.success('已驳回')
    refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  }
}

const openSettleDialog = (event) => {
  currentEvent.value = event
  settleForm.value = {
    completion_id: '',
    completion_avatar: '',
    completion_time: '',
    result: ''
  }
  settleDialogOpen.value = true
}

const submitSettle = async () => {
  if (!currentEvent.value) return
  const payload = currentEvent.value.type === 'bounty'
    ? {
        completion: {
          id: settleForm.value.completion_id,
          avatar: settleForm.value.completion_avatar,
          time: settleForm.value.completion_time
        }
      }
    : { result: settleForm.value.result }

  try {
    await axios.post(`/api/event/${currentEvent.value.id}/settle`, { payload, status: 'settled' })
    ElMessage.success('已结算')
    settleDialogOpen.value = false
    refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  }
}

const openResultDialog = (event) => {
  currentEvent.value = event
  resultRows.value = [
    { rank: 1, id: '', avatar: '' },
    { rank: 2, id: '', avatar: '' },
    { rank: 3, id: '', avatar: '' }
  ]
  resultDialogOpen.value = true
}

const addResultRow = () => {
  resultRows.value.push({ rank: resultRows.value.length + 1, id: '', avatar: '' })
}

const handleResultUploadClick = (index) => {
  uploadIndex.value = index
  resultFileInput.value?.click()
}

const handleResultFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file || currentEvent.value == null) return
  uploading.value = true
  uploadPercent.value = 0
  try {
    const compressed = await compressImage(file)
    const formData = new FormData()
    formData.append('file', compressed)
    formData.append('eid', currentEvent.value.id)
    const res = await axios.post('/api/upload/visitor/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (!progressEvent.total) return
        uploadPercent.value = Math.round((progressEvent.loaded / progressEvent.total) * 100)
      }
    })
    if (uploadIndex.value != null) {
      resultRows.value[uploadIndex.value].avatar = res.data?.url || ''
    }
    ElMessage.success('头像已上传')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    uploading.value = false
    uploadPercent.value = 0
    uploadIndex.value = null
    event.target.value = ''
  }
}

const submitResults = async () => {
  if (!currentEvent.value) return
  const results = resultRows.value.filter((row) => row.id)
  if (results.some((row) => !row.avatar)) {
    return ElMessage.warning('请为每个名次上传头像')
  }
  try {
    await axios.post(`/api/event/${currentEvent.value.id}/set_result`, { results })
    ElMessage.success('排名已保存')
    resultDialogOpen.value = false
    refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  }
}

const updateStatus = async (event, status) => {
  try {
    await axios.post(`/api/event/${event.id}/status`, { status })
    ElMessage.success('状态已更新')
    refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  }
}

const softDelete = async (event) => {
  try {
    await ElMessageBox.confirm('确认删除该活动？删除后将从前台隐藏。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await axios.post(`/api/event/${event.id}/delete`)
    ElMessage.success('已删除')
    refresh()
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error.response?.data?.message || error.message)
  }
}

const openParticipants = async (event) => {
  currentEvent.value = event
  participantsDialogOpen.value = true
  participantsLoading.value = true
  participantsItems.value = []
  try {
    const res = await axios.get(`/api/event/${event.id}/participants`)
    participantsItems.value = res.data?.items || []
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    participantsLoading.value = false
  }
}

onMounted(() => {
  fetchPending()
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="px-4 py-2 rounded-full text-sm"
        :class="activeTab === 'pending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
        @click="activeTab = 'pending'; fetchPending()"
      >
        待审核
      </button>
      <button
        class="px-4 py-2 rounded-full text-sm"
        :class="activeTab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
        @click="activeTab = 'all'; fetchAll()"
      >
        活动管理
      </button>
      <button
        class="ml-auto px-4 py-2 rounded-full text-sm bg-emerald-600 text-white"
        @click="publishDialogOpen = true"
      >
        发布活动
      </button>
      <button class="text-xs text-slate-500" @click="refresh">刷新</button>
    </div>

    <div v-if="loading" class="text-center text-sm text-slate-400">加载中...</div>

    <div v-else class="grid gap-6">
      <EventCard
        v-for="event in activeTab === 'pending' ? pendingItems : allItems"
        :key="event.id"
        :event="event"
      >
        <template #actions>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="activeTab === 'pending'"
              class="px-3 py-1.5 rounded-full text-xs bg-emerald-600 text-white"
              @click="approveEvent(event)"
            >通过</button>
            <button
              v-if="activeTab === 'pending'"
              class="px-3 py-1.5 rounded-full text-xs bg-rose-500 text-white"
              @click="rejectEvent(event)"
            >驳回</button>
            <button
              v-if="event.type === 'bounty' || event.type === 'bet'"
              class="px-3 py-1.5 rounded-full text-xs bg-amber-500 text-white"
              @click="openSettleDialog(event)"
            >结算</button>
            <button
              v-if="event.type === 'match' || event.type === 'stg'"
              class="px-3 py-1.5 rounded-full text-xs bg-indigo-500 text-white"
              @click="openResultDialog(event)"
            >录入排名</button>
            <button
              v-if="event.type === 'match' || event.type === 'stg'"
              class="px-3 py-1.5 rounded-full text-xs bg-emerald-700 text-white"
              @click="openParticipants(event)"
            >参赛名单</button>
            <button
              v-if="event.type === 'match' || event.type === 'stg' || event.type === 'gathering'"
              class="px-3 py-1.5 rounded-full text-xs bg-slate-700 text-white"
              @click="updateStatus(event, 'ongoing')"
            >进行中</button>
            <button
              v-if="event.type === 'match' || event.type === 'stg' || event.type === 'gathering'"
              class="px-3 py-1.5 rounded-full text-xs bg-slate-500 text-white"
              @click="updateStatus(event, 'ended')"
            >已结束</button>
            <button
              v-if="activeTab === 'all'"
              class="px-3 py-1.5 rounded-full text-xs bg-rose-600 text-white"
              @click="softDelete(event)"
            >删除</button>
          </div>
        </template>
      </EventCard>

      <div v-if="!(activeTab === 'pending' ? pendingItems.length : allItems.length)" class="text-center text-sm text-slate-400">
        暂无活动
      </div>
    </div>

    <el-dialog v-model="settleDialogOpen" title="结算" width="480px">
      <div v-if="currentEvent?.type === 'bounty'" class="space-y-3">
        <el-input v-model="settleForm.completion_id" placeholder="完成人ID" />
        <el-input v-model="settleForm.completion_avatar" placeholder="完成人头像URL" />
        <el-input v-model="settleForm.completion_time" placeholder="完成时间" />
      </div>
      <div v-else class="space-y-3">
        <el-input v-model="settleForm.result" placeholder="胜败结果" />
      </div>
      <template #footer>
        <el-button @click="settleDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="submitSettle">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultDialogOpen" title="录入排名" width="560px">
      <div class="space-y-3">
        <div v-for="(row, index) in resultRows" :key="row.rank" class="grid grid-cols-3 gap-2 items-center">
          <el-input v-model="row.rank" placeholder="名次" />
          <el-input v-model="row.id" placeholder="ID" />
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 rounded-full text-xs bg-slate-900 text-white"
              @click="handleResultUploadClick(index)"
            >
              上传头像
            </button>
            <img v-if="row.avatar" :src="row.avatar" class="w-8 h-8 rounded-full object-cover" />
          </div>
        </div>
        <el-button type="primary" plain @click="addResultRow">追加一行</el-button>
        <div v-if="uploading" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
        </div>
      </div>
      <template #footer>
        <el-button @click="resultDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="submitResults">保存</el-button>
      </template>
    </el-dialog>

    <input ref="resultFileInput" type="file" class="hidden" accept="image/*" @change="handleResultFileChange" />

    <el-dialog v-model="publishDialogOpen" title="发布活动" width="720px" destroy-on-close>
      <EventForm
        :allowed-types="['bounty', 'bet', 'match', 'stg', 'gathering']"
        :is-admin="true"
        submit-label="发布活动"
        @submitted="() => { publishDialogOpen = false; refresh() }"
      />
    </el-dialog>

    <el-dialog v-model="participantsDialogOpen" title="参赛名单" width="640px" destroy-on-close>
      <div v-if="participantsLoading" class="text-sm text-slate-400">加载中...</div>
      <div v-else-if="!participantsItems.length" class="text-sm text-slate-400">暂无报名成员</div>
      <div v-else class="space-y-3 text-sm text-slate-700">
        <div class="text-xs text-slate-500">共 {{ participantsItems.length }} 人</div>
        <div class="grid gap-3">
          <div v-for="item in participantsItems" :key="item.id" class="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2">
            <img v-if="item.avatar" :src="item.avatar" class="w-10 h-10 rounded-full object-cover" />
            <div class="flex-1">
              <div class="font-semibold">{{ item.common_id || '未填写' }}</div>
              <div class="text-xs text-slate-500">QQ: {{ item.qq || '未填写' }}</div>
            </div>
            <div class="text-xs text-slate-400 text-right">
              <div>{{ item.pilot_source || '来源未知' }}</div>
              <div>{{ item.machine_sign || '机签未填' }}</div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </section>
</template>
