<script setup>
import { ref, computed } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { compressImage } from '../../utils/image'

const props = defineProps({
  allowedTypes: {
    type: Array,
    default: () => ['bounty', 'bet']
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  submitLabel: {
    type: String,
    default: '提交活动'
  }
})

const emit = defineEmits(['submitted'])

const loading = ref(false)
const draftId = ref(null)
const fileInput = ref(null)
const uploadTarget = ref('')
const betMode = ref('solo')
const uploadingTarget = ref('')
const uploadPercent = ref(0)

const form = ref({
  type: props.allowedTypes[0] || 'bounty',
  title: '',
  initiator_id: '',
  initiator_qq: '',
  initiator_avatar: '',
  challenge: '',
  requirements: '',
  reward: '',
  limit: '',
  deadline: '',
  a_id: '',
  a_qq: '',
  a_avatar: '',
  a_goal: '',
  b_id: '',
  b_qq: '',
  b_avatar: '',
  b_goal: '',
  penalty: '',
  proof_image: '',
  copy: '',
  cover: '',
  time: '',
  rules: '',
  prizes: '',
  notes: '',
  location: '',
  gather_type: ''
})

const typeOptions = computed(() => props.allowedTypes)

const ensureDraft = async () => {
  if (draftId.value) return draftId.value
  const res = await axios.post('/api/event/draft')
  draftId.value = res.data.id
  return draftId.value
}

const handleUploadClick = (target) => {
  uploadTarget.value = target
  fileInput.value?.click()
}

const handleFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const draft = await ensureDraft()
    const compressed = await compressImage(file)
    const formData = new FormData()
    formData.append('file', compressed)
    formData.append('eid', draft)
    uploadingTarget.value = uploadTarget.value
    uploadPercent.value = 0
    const res = await axios.post('/api/upload/visitor', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (!progressEvent.total) return
        uploadPercent.value = Math.round((progressEvent.loaded / progressEvent.total) * 100)
      }
    })
    const url = res.data?.url || ''
    if (uploadTarget.value) {
      form.value[uploadTarget.value] = url
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    uploadingTarget.value = ''
    uploadPercent.value = 0
    event.target.value = ''
  }
}

const buildContent = () => {
  const type = form.value.type
  if (type === 'bounty') {
    return {
      initiator: {
        id: form.value.initiator_id,
        qq: form.value.initiator_qq,
        avatar: form.value.initiator_avatar
      },
      challenge: form.value.challenge,
      requirements: form.value.requirements,
      reward: form.value.reward,
      limit: form.value.limit,
      deadline: form.value.deadline
    }
  }
  if (type === 'bet') {
    return {
      a: {
        id: form.value.a_id,
        qq: form.value.a_qq,
        avatar: form.value.a_avatar,
        goal: form.value.a_goal
      },
      b: betMode.value === 'duo' && form.value.b_id ? {
        id: form.value.b_id,
        qq: form.value.b_qq,
        avatar: form.value.b_avatar,
        goal: form.value.b_goal
      } : null,
      penalty: form.value.penalty,
      deadline: form.value.deadline,
      proof_image: form.value.proof_image
    }
  }
  if (type === 'match' || type === 'stg') {
    return {
      copy: form.value.copy,
      cover: form.value.cover,
      time: form.value.time,
      rules: form.value.rules,
      prizes: form.value.prizes,
      notes: form.value.notes
    }
  }
  if (type === 'gathering') {
    return {
      cover: form.value.cover,
      time: form.value.time,
      location: form.value.location,
      gather_type: form.value.gather_type,
      notes: form.value.notes
    }
  }
  return {}
}

const resetForm = () => {
  const currentType = form.value.type
  betMode.value = 'solo'
  form.value = {
    ...form.value,
    type: currentType,
    title: '',
    initiator_id: '',
    initiator_qq: '',
    initiator_avatar: '',
    challenge: '',
    requirements: '',
    reward: '',
    limit: '',
    deadline: '',
    a_id: '',
    a_qq: '',
    a_avatar: '',
    a_goal: '',
    b_id: '',
    b_qq: '',
    b_avatar: '',
    b_goal: '',
    penalty: '',
    proof_image: '',
    copy: '',
    cover: '',
    time: '',
    rules: '',
    prizes: '',
    notes: '',
    location: '',
    gather_type: ''
  }
  draftId.value = null
}

const handleSubmit = async () => {
  if (!form.value.title) return ElMessage.warning('请填写标题')
  if (form.value.type === 'bounty' && !form.value.reward) {
    return ElMessage.warning('悬赏令必须填写奖励')
  }
  if (form.value.type === 'bounty' && !form.value.initiator_avatar) {
    return ElMessage.warning('请上传发起人头像')
  }
  if (form.value.type === 'bet' && !form.value.a_avatar) {
    return ElMessage.warning('请上传发起者头像')
  }
  if (form.value.type === 'bet' && betMode.value === 'duo' && form.value.b_id && !form.value.b_avatar) {
    return ElMessage.warning('请上传对手头像')
  }
  loading.value = true
  try {
    const draft = await ensureDraft()
    const payload = {
      type: form.value.type,
      title: form.value.title,
      content: buildContent()
    }
    await axios.put(`/api/event/${draft}`, {
      ...payload,
      submit: !props.isAdmin
    })
    if (props.isAdmin) {
      await axios.post(`/api/event/${draft}/approve`)
    }
    ElMessage.success(props.isAdmin ? '发布成功' : '提交成功，等待审核')
    emit('submitted')
    resetForm()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-[#1f2024] p-6 shadow-sm space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">发布活动</h3>
        <p class="text-xs text-slate-500">选择类型后填写对应的活动信息</p>
      </div>
      <select v-model="form.type" class="px-3 py-1.5 rounded-full border border-slate-200/70 bg-white dark:bg-slate-900/40 text-sm">
        <option v-for="item in typeOptions" :key="item" :value="item">{{ item }}</option>
      </select>
    </div>

    <div class="grid gap-4">
      <label class="space-y-1">
        <span class="text-xs text-slate-500">标题</span>
        <input v-model="form.title" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
      </label>

      <template v-if="form.type === 'bounty'">
        <div class="grid md:grid-cols-2 gap-4">
          <label class="space-y-1">
            <span class="text-xs text-slate-500">发起人ID</span>
            <input v-model="form.initiator_id" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-500">QQ</span>
            <input v-model="form.initiator_qq" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
        </div>
        <div class="space-y-2">
          <span class="text-xs text-slate-500">发起人头像上传</span>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm" @click="handleUploadClick('initiator_avatar')">上传头像</button>
            <span class="text-xs text-slate-400 truncate">{{ form.initiator_avatar || '未上传' }}</span>
          </div>
          <div v-if="uploadingTarget === 'initiator_avatar'" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">挑战形式</span>
          <input v-model="form.challenge" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">要求</span>
          <textarea v-model="form.requirements" rows="3" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">奖励 (必填)</span>
          <input v-model="form.reward" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">参与限制</span>
          <input v-model="form.limit" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">截止时间</span>
          <input v-model="form.deadline" type="datetime-local" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
      </template>

      <template v-else-if="form.type === 'bet'">
        <div class="flex items-center gap-3 text-sm">
          <label class="flex items-center gap-2">
            <input type="radio" value="solo" v-model="betMode" />
            单人赌约
          </label>
          <label class="flex items-center gap-2">
            <input type="radio" value="duo" v-model="betMode" />
            双人对赌
          </label>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          <label class="space-y-1">
            <span class="text-xs text-slate-500">发起者ID</span>
            <input v-model="form.a_id" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-500">发起者QQ</span>
            <input v-model="form.a_qq" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-500">发起者目标</span>
            <input v-model="form.a_goal" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
        </div>
        <div v-if="betMode === 'duo'" class="grid md:grid-cols-2 gap-4">
          <label class="space-y-1">
            <span class="text-xs text-slate-500">对手ID</span>
            <input v-model="form.b_id" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-500">对手QQ</span>
            <input v-model="form.b_qq" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-500">对手目标</span>
            <input v-model="form.b_goal" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
          </label>
        </div>
        <div class="space-y-2">
          <span class="text-xs text-slate-500">发起者头像上传</span>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm" @click="handleUploadClick('a_avatar')">上传头像</button>
            <span class="text-xs text-slate-400 truncate">{{ form.a_avatar || '未上传' }}</span>
          </div>
          <div v-if="uploadingTarget === 'a_avatar'" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
        <div v-if="betMode === 'duo'" class="space-y-2">
          <span class="text-xs text-slate-500">对手头像上传</span>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm" @click="handleUploadClick('b_avatar')">上传头像</button>
            <span class="text-xs text-slate-400 truncate">{{ form.b_avatar || '未上传' }}</span>
          </div>
          <div v-if="uploadingTarget === 'b_avatar'" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">惩罚/代价</span>
          <input v-model="form.penalty" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">截止时间</span>
          <input v-model="form.deadline" type="datetime-local" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <div class="space-y-2">
          <span class="text-xs text-slate-500">存档截图</span>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm" @click="handleUploadClick('proof_image')">上传图片</button>
            <span class="text-xs text-slate-400 truncate">{{ form.proof_image || '未上传' }}</span>
          </div>
          <div v-if="uploadingTarget === 'proof_image'" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
      </template>

      <template v-else-if="form.type === 'match' || form.type === 'stg'">
        <label class="space-y-1">
          <span class="text-xs text-slate-500">活动文案</span>
          <textarea v-model="form.copy" rows="3" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <div class="space-y-2">
          <span class="text-xs text-slate-500">封面</span>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm" @click="handleUploadClick('cover')">上传封面</button>
            <span class="text-xs text-slate-400 truncate">{{ form.cover || '未上传' }}</span>
          </div>
          <div v-if="uploadingTarget === 'cover'" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">时间</span>
          <input v-model="form.time" type="datetime-local" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">规则</span>
          <textarea v-model="form.rules" rows="2" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">奖品</span>
          <textarea v-model="form.prizes" rows="2" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">注意事项</span>
          <textarea v-model="form.notes" rows="2" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
      </template>

      <template v-else-if="form.type === 'gathering'">
        <div class="space-y-2">
          <span class="text-xs text-slate-500">封面</span>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-full bg-slate-900 text-white text-sm" @click="handleUploadClick('cover')">上传封面</button>
            <span class="text-xs text-slate-400 truncate">{{ form.cover || '未上传' }}</span>
          </div>
          <div v-if="uploadingTarget === 'cover'" class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">时间</span>
          <input v-model="form.time" type="datetime-local" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">地点</span>
          <input v-model="form.location" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">类型</span>
          <select v-model="form.gather_type" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2">
            <option value="">请选择</option>
            <option value="小聚">小聚</option>
            <option value="大聚">大聚</option>
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-xs text-slate-500">备注</span>
          <textarea v-model="form.notes" rows="2" class="w-full rounded-lg border border-slate-200/70 bg-white/80 dark:bg-slate-900/40 px-3 py-2" />
        </label>
      </template>
    </div>

    <input ref="fileInput" type="file" class="hidden" accept="image/*" @change="handleFileChange" />

    <button
      class="w-full py-3 rounded-full bg-gradient-to-r from-slate-900 to-slate-700 text-white text-sm font-semibold tracking-wide disabled:opacity-60"
      :disabled="loading"
      @click="handleSubmit"
    >
      {{ loading ? '提交中...' : submitLabel }}
    </button>
  </section>
</template>
