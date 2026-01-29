<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage } from '../../utils/image'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

// Loading states
const pageLoading = ref(false)
const saveLoading = ref(false)
const purgeLoading = ref(false)
// 记录正在上传的字段 key
const uploadingKeys = reactive(new Set())

// 配置表单数据
const configForm = reactive({ 
  home_bg: '', 
  join_bg: '', 
  banner_text: '', 
  badge_image: '', 
  mascot_image: '', 
  qq_qr_image: '' 
})

// 配置项定义 (用于渲染循环，减少模板代码)
const imageConfigs = [
  { key: 'home_bg', label: '主页背景', desc: '首页大幅背景图' },
  { key: 'join_bg', label: '加群背景', desc: '加群页面背景图' },
  { key: 'badge_image', label: '徽章图标', desc: '显示在标题上的群头像' },
  { key: 'mascot_image', label: '看板娘', desc: '笨琪露的自拍照' },
  { key: 'qq_qr_image', label: '加群二维码', desc: 'QQ二维码' }
]

const fetchConfig = async () => {
  pageLoading.value = true
  try {
    const res = await axios.get('/api/config')
    // 仅更新存在的字段，防止覆盖 reactive 对象引用
    Object.assign(configForm, res.data || {})
  } catch (e) {
    ElMessage.error('加载配置失败')
  } finally {
    pageLoading.value = false
  }
}

// 统一上传处理函数
const handleUpload = async (key, event) => {
  const file = event.target.files[0]
  if (!file) return

  // 重置 input value 防止重复上传同一文件不触发 change
  event.target.value = ''

  try {
    uploadingKeys.add(key)
    
    // 1. 压缩
    const compressed = await compressImage(file)
    
    // 2. 上传
    const d = new FormData()
    d.append('file', compressed)
    const r = await axios.post('/api/upload', d)
    
    // 3. 赋值
    configForm[key] = r.data.url
    ElMessage.success('上传成功，记得点击保存')
  } catch (e) {
    console.error(e)
    ElMessage.error('上传失败: ' + (e.message || '网络错误'))
  } finally {
    uploadingKeys.delete(key)
  }
}

const saveConfig = async () => {
  saveLoading.value = true
  try {
    // 这是一个高风险操作，保留确认弹窗
    // await ElMessageBox.confirm('确认保存所有配置项并立即生效？', '保存配置', { type: 'warning' })
    
    // 构造请求数组
    const requests = [
      { key: 'home_bg', value: configForm.home_bg },
      { key: 'join_bg', value: configForm.join_bg },
      { key: 'banner_text', value: configForm.banner_text },
      { key: 'badge_image', value: configForm.badge_image },
      { key: 'mascot_image', value: configForm.mascot_image },
      { key: 'qq_qr_image', value: configForm.qq_qr_image }
    ].map(item => axios.post('/api/config', item))

    // 并发执行，任何一个失败都会抛出错误
    await Promise.all(requests)
    
    ElMessage.success('全局配置已更新')
    // 重新获取以确保数据一致性
    await fetchConfig()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('保存失败，部分配置可能未更新')
  } finally {
    saveLoading.value = false
  }
}

const purgeRecycleBin = async () => {
  try {
    await ElMessageBox.confirm(
      '⚠️ 危险操作：清空回收站将【永久删除】所有已软删除的记录及其关联的图片资源。\n此操作不可撤销！',
      '清空回收站',
      { 
        type: 'warning', 
        confirmButtonText: '确定彻底删除', 
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    purgeLoading.value = true
    const res = await axios.post('/api/admin/recycle-bin/purge')
    const { activities = 0, members = 0, history = 0 } = res.data?.result || {}
    
    ElMessageBox.alert(
      `清理完成！\n\n📝 活动记录: ${activities} 条\n👥 成员记录: ${members} 条\n📜 历史记录: ${history} 条`, 
      '操作成功', 
      { type: 'success' }
    )
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('清空失败: ' + (e.response?.data?.message || e.message))
  } finally {
    purgeLoading.value = false
  }
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 pb-10">
    <!-- 资源配置区块 -->
    <div class="bg-white rounded-xl shadow-sm border-t-4 border-purple-500 overflow-hidden">
      <div class="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div>
          <h2 class="font-bold text-lg text-gray-800">全局资源配置</h2>
          <p class="text-xs text-gray-500 mt-1">设置网站的背景、图标及核心文案</p>
        </div>
        <button 
          @click="saveConfig" 
          :disabled="saveLoading"
          class="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span v-if="saveLoading" class="animate-spin">🔄</span>
          {{ saveLoading ? '保存中...' : '保存所有配置' }}
        </button>
      </div>

      <div class="p-8 space-y-8">
        <div v-if="pageLoading" class="text-center py-10 text-gray-400">
           <span class="animate-spin text-2xl block mb-2">⏳</span>加载配置中...
        </div>

        <template v-else>
          <!-- 循环渲染图片配置项 -->
          <div v-for="item in imageConfigs" :key="item.key" class="grid md:grid-cols-12 gap-6 items-start border-b border-gray-100 pb-6 last:border-0 last:pb-0">
            <!-- 左侧：标签与描述 -->
            <div class="md:col-span-4">
              <label class="font-bold text-gray-700 block mb-1">{{ item.label }}</label>
              <p class="text-xs text-gray-400">{{ item.desc }}</p>
            </div>

            <!-- 右侧：预览与上传 -->
            <div class="md:col-span-8 flex items-start gap-4">
              <!-- 图片预览框 -->
              <div class="relative group bg-gray-100 rounded-lg w-32 h-20 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200">
                <img 
                  v-if="configForm[item.key]" 
                  :src="configForm[item.key]" 
                  class="w-full h-full object-cover transition transform group-hover:scale-110"
                >
                <div v-else class="text-xs text-gray-400">无图片</div>
                
                <!-- 加载遮罩 -->
                <div v-if="uploadingKeys.has(item.key)" class="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                   <span class="animate-spin text-white">🔄</span>
                </div>
              </div>

              <!-- 操作区 -->
              <div class="flex-grow space-y-2">
                <div class="flex gap-2">
                  <input 
                    v-model="configForm[item.key]" 
                    class="flex-grow text-xs border rounded px-2 py-1.5 text-gray-500 font-mono bg-gray-50 focus:bg-white transition outline-none focus:ring-1 focus:ring-purple-300" 
                    placeholder="图片 URL (可直接粘贴链接)"
                  >
                </div>
                
                <div class="flex items-center gap-2">
                  <label class="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs px-3 py-1.5 rounded transition shadow-sm select-none">
                    <span>上传新图</span>
                    <input type="file" accept="image/*" class="hidden" @change="(e) => handleUpload(item.key, e)">
                  </label>
                  <span v-if="uploadingKeys.has(item.key)" class="text-xs text-purple-600 animate-pulse">正在压缩上传...</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 文本配置项 (Banner) -->
          <div class="grid md:grid-cols-12 gap-6 items-center pt-2">
             <div class="md:col-span-4">
              <label class="font-bold text-gray-700 block mb-1">副标题</label>
              <p class="text-xs text-gray-400">显示在首页大标题下方的文字</p>
            </div>
            <div class="md:col-span-8">
              <input 
                v-model="configForm.banner_text" 
                class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-purple-200 outline-none transition"
                placeholder="请输入一些有趣的介绍文字..."
              >
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 回收站管理区块 (仅超级管理员) -->
    <div v-if="isSuperAdmin" class="bg-white rounded-xl shadow-sm border-t-4 border-red-500 overflow-hidden">
      <div class="p-6 border-b border-gray-100 bg-red-50/30">
        <h2 class="font-bold text-lg text-red-700 flex items-center gap-2">
          🗑️ 回收站管理
          <span class="text-xs font-normal bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Super Admin</span>
        </h2>
      </div>
      <div class="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="text-sm text-gray-600 max-w-lg">
          <p class="mb-2"><strong>警告：</strong> "软删除"的数据目前仍占用数据库和存储空间。</p>
          <p>执行清空操作将<span class="text-red-600 font-bold">永久销毁</span>所有标记为“已删除”的 活动、成员、群史记录，并尝试从服务器删除对应的图片文件。此过程不可逆。</p>
        </div>
        <button 
          @click="purgeRecycleBin" 
          :disabled="purgeLoading"
          class="bg-red-600 text-white px-8 py-3 rounded-lg hover:bg-red-700 transition shadow-md whitespace-nowrap disabled:opacity-50 flex items-center gap-2 font-bold"
        >
          <span v-if="purgeLoading" class="animate-spin">⚙️</span>
          {{ purgeLoading ? '正在清理...' : '🗑️ 彻底清空回收站' }}
        </button>
      </div>
    </div>
  </div>
</template>