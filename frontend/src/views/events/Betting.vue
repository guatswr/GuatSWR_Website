<script setup>
import { ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

// 表单数据
const form = ref({
  title: '',
  desc: '',
  file: null
})
const loading = ref(false)
const step = ref(1) // 1: 填写, 2: 提交成功
const previewUrl = ref('')

// 文件选择
const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    form.value.file = file
    previewUrl.value = URL.createObjectURL(file)
  }
}

// 提交流程
const handleSubmit = async () => {
  if (!form.value.title || !form.value.file) {
    return ElMessage.warning('请填写标题并上传图片')
  }

  loading.value = true
  try {
    // 1. 创建草稿获取 EID
    // 注意：这里用 /api/event/draft，不需要鉴权
    const draftRes = await axios.post('/api/event/draft')
    const eid = draftRes.data.id
    console.log('Got EID:', eid)

    // 2. 上传图片
    const formData = new FormData()
    formData.append('file', form.value.file)
    formData.append('eid', eid) // 必须带上 EID

    const uploadRes = await axios.post('/api/upload/visitor', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const imageUrl = uploadRes.data.url
    console.log('Upload success:', imageUrl)

    // 3. 完善信息并提交审核
    // 注意：submit: true 表示将状态改为 pending
    await axios.put(`/api/event/${eid}`, {
      type: 'betting', // 类型
      title: form.value.title,
      content: {
        desc: form.value.desc,
        imageUrl: imageUrl, // 保存图片链接到 content JSON 中
        money: 50 // 模拟一个对赌金额
      },
      submit: true
    })

    ElMessage.success('提交成功，请等待管理员审核')
    step.value = 2
    
    // 清空表单
    form.value = { title: '', desc: '', file: null }
    previewUrl.value = ''

  } catch (error) {
    console.error(error)
    ElMessage.error('提交失败: ' + (error.response?.data?.message || error.message))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto p-6">
    <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
      <span>⚖️</span> 发起对赌协议（施工中，该页面仅用来验证后端接口）
    </h2>

    <!-- 步骤 1: 填写表单 -->
    <div v-if="step === 1" class="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      
      <!-- 标题 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">协议标题</label>
        <input 
          v-model="form.title"
          type="text" 
          placeholder="例如：赌我能不能一周内通关地灵殿L"
          class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent focus:ring-2 focus:ring-sky-500 outline-none dark:text-white transition"
        >
      </div>

      <!-- 图片上传 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">证明材料/封面图</label>
        <div class="flex items-start gap-4">
          <div 
            class="w-32 h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-900 cursor-pointer hover:border-sky-500 transition relative"
            @click="$refs.fileInput.click()"
          >
            <img v-if="previewUrl" :src="previewUrl" class="w-full h-full object-cover">
            <span v-else class="text-gray-400 text-xs text-center px-2">点击上传<br>(支持jpg/png)</span>
            <input 
              ref="fileInput" 
              type="file" 
              class="hidden" 
              accept="image/*"
              @change="handleFileChange"
            >
          </div>
          <div class="text-xs text-gray-500 mt-2">
            <p>上传证明你决心的图片。</p>
            <p>图片将上传至服务器独立区域。</p>
          </div>
        </div>
      </div>

      <!-- 描述 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">详细说明</label>
        <textarea 
          v-model="form.desc"
          rows="4"
          placeholder="详细描述对赌内容、见证人等..."
          class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent focus:ring-2 focus:ring-sky-500 outline-none dark:text-white transition"
        ></textarea>
      </div>

      <!-- 提交按钮 -->
      <button 
        @click="handleSubmit" 
        :disabled="loading"
        class="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-gray-400 text-white font-bold rounded-lg transition shadow-md flex items-center justify-center gap-2"
      >
        <span v-if="loading" class="animate-spin">⌛</span>
        <span>{{ loading ? '正在提交...' : '确认发起' }}</span>
      </button>
    </div>

    <!-- 步骤 2: 成功页 -->
    <div v-else class="text-center p-10 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
      <div class="text-5xl mb-4">✅</div>
      <h3 class="text-xl font-bold text-green-700 dark:text-green-400 mb-2">提交成功！</h3>
      <p class="text-gray-600 dark:text-gray-300 mb-6">你的对赌协议已进入审核队列，管理员审核通过后将公示。</p>
      <button 
        @click="step = 1"
        class="px-6 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        返回再发一条
      </button>
    </div>
  </div>
</template>