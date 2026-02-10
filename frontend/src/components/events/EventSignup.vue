<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { compressImage } from '../../utils/image'

const props = defineProps({
  eventId: {
    type: [String, Number],
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const loading = ref(false)
const deleting = ref(false)
const uploading = ref(false)
const uploadPercent = ref(0)
const fileInput = ref(null)
const form = ref({
  common_id: '',
  machine_sign: '',
  pilot_source: '',
  qq: '',
  avatar: ''
})

const loadSignup = async () => {
  try {
    const res = await axios.get(`/api/event/${props.eventId}/signup`)
    if (res.data?.data) {
      form.value = {
        common_id: res.data.data.common_id || '',
        machine_sign: res.data.data.machine_sign || '',
        pilot_source: res.data.data.pilot_source || '',
        qq: res.data.data.qq || '',
        avatar: res.data.data.avatar || ''
      }
    }
  } catch (err) {
    void err
  }
}

const handleSubmit = async () => {
  if (!form.value.common_id || !form.value.qq) {
    return ElMessage.warning('请填写常用ID与QQ')
  }
  if (!form.value.avatar) {
    return ElMessage.warning('请先上传头像')
  }
  loading.value = true
  try {
    await axios.post(`/api/event/${props.eventId}/signup`, form.value)
    ElMessage.success('报名信息已保存')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    loading.value = false
  }
}

const handleDelete = async () => {
  deleting.value = true
  try {
    await axios.delete(`/api/event/${props.eventId}/signup`)
    form.value = { common_id: '', machine_sign: '', pilot_source: '', qq: '', avatar: '' }
    ElMessage.success('报名已删除')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    deleting.value = false
  }
}

const handleAvatarUpload = () => {
  fileInput.value?.click()
}

const handleFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  uploading.value = true
  uploadPercent.value = 0
  try {
    const compressed = await compressImage(file)
    const formData = new FormData()
    formData.append('file', compressed)
    formData.append('eid', props.eventId)
    const res = await axios.post('/api/upload/visitor/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (!progressEvent.total) return
        uploadPercent.value = Math.round((progressEvent.loaded / progressEvent.total) * 100)
      }
    })
    form.value.avatar = res.data?.url || ''
    ElMessage.success('头像已上传')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    uploading.value = false
    uploadPercent.value = 0
    event.target.value = ''
  }
}

onMounted(() => {
  loadSignup()
})
</script>

<template>
  <div class="bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h4 class="text-base font-semibold text-slate-900 dark:text-white">报名信息</h4>
        <p class="text-xs text-slate-500">保存后会记住你的填写内容</p>
      </div>
      <button
        class="text-xs text-rose-500 hover:text-rose-600"
        @click="handleDelete"
        :disabled="deleting || disabled"
      >
        {{ deleting ? '删除中...' : '删除报名' }}
      </button>
    </div>

    <div class="grid md:grid-cols-2 gap-4 text-sm">
      <label class="space-y-1">
        <span class="text-xs text-slate-500">常用ID</span>
        <input v-model="form.common_id" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" :disabled="disabled" />
      </label>
      <label class="space-y-1">
        <span class="text-xs text-slate-500">机签</span>
        <input v-model="form.machine_sign" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" :disabled="disabled" />
      </label>
      <label class="space-y-1">
        <span class="text-xs text-slate-500">机师来源</span>
        <select v-model="form.pilot_source" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" :disabled="disabled">
          <option value="">请选择</option>
          <option value="桂电">桂电</option>
          <option value="桂航">桂航</option>
          <option value="师大">师大</option>
          <option value="桂工">桂工</option>
          <option value="桂旅">桂旅</option>
          <option value="漓院">漓院</option>
          <option value="桂信">桂信</option>
          <option value="桂师">桂师</option>
          <option value="桂医">桂医</option>
          <option value="其他">其他</option>
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-xs text-slate-500">QQ</span>
        <input v-model="form.qq" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" :disabled="disabled" />
      </label>
    </div>

    <div class="mt-3 flex items-center gap-3 text-xs text-slate-500">
      <button
        class="px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs"
        :disabled="uploading || disabled"
        @click="handleAvatarUpload"
      >
        {{ uploading ? '上传中...' : '上传头像' }}
      </button>
      <span class="truncate">{{ form.avatar || '未上传' }}</span>
    </div>
    <div v-if="uploading" class="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
      <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
    </div>
    <div v-if="form.avatar" class="mt-3 flex items-center gap-3 text-xs text-slate-500">
      <img :src="form.avatar" alt="avatar" class="w-10 h-10 rounded-full object-cover" />
      <span>已上传头像</span>
    </div>

    <div class="mt-4 flex flex-wrap gap-3">
      <button
        class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
        @click="handleSubmit"
        :disabled="loading || disabled"
      >
        {{ loading ? '提交中...' : '保存报名' }}
      </button>
    </div>

    <input ref="fileInput" type="file" class="hidden" accept="image/*" @change="handleFileChange" />
  </div>
</template>
