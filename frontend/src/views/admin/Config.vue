<script setup>
import { reactive, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage } from '../../utils/image'
import { useUserStore } from '../../stores/user'

const configForm = reactive({ home_bg: '', join_bg: '', banner_text: '', badge_image: '', mascot_image: '', qq_qr_image: '' })
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

const fetchConfig = async () => {
  try {
    const res = await axios.get('/api/config')
    Object.assign(configForm, res.data)
  } catch (e) {
    ElMessage.error('加载配置失败')
  }
}

onMounted(() => {
  fetchConfig()
})

const uploadFile = async (file) => {
  const compressed = await compressImage(file)
  const d = new FormData()
  d.append('file', compressed)
  const r = await axios.post('/api/upload', d)
  return r.data.url
}

const handleBgUpload = async (e) => { if(e.target.files[0]) try{configForm.home_bg=await uploadFile(e.target.files[0])}catch(e){ ElMessage.error('上传失败') } }
const handleJoinBgUpload = async (e) => { if(e.target.files[0]) try{configForm.join_bg=await uploadFile(e.target.files[0])}catch(e){ ElMessage.error('上传失败') } }
const handleBadgeUpload = async (e) => { if(e.target.files[0]) try{configForm.badge_image=await uploadFile(e.target.files[0])}catch(e){ ElMessage.error('上传失败') } }
const handleMascotUpload = async (e) => { if(e.target.files[0]) try{configForm.mascot_image=await uploadFile(e.target.files[0])}catch(e){ ElMessage.error('上传失败') } }
const handleQRUpload = async (e) => { if(e.target.files[0]) try{configForm.qq_qr_image=await uploadFile(e.target.files[0])}catch(e){ ElMessage.error('上传失败') } }

const saveConfig = async () => {
  try {
    await ElMessageBox.confirm('确认保存配置并生效？', '确认保存', { type: 'warning' })
    await Promise.all([
      axios.post('/api/config', { key: 'home_bg', value: configForm.home_bg }),
      axios.post('/api/config', { key: 'join_bg', value: configForm.join_bg }),
      axios.post('/api/config', { key: 'banner_text', value: configForm.banner_text }),
      axios.post('/api/config', { key: 'badge_image', value: configForm.badge_image }),
      axios.post('/api/config', { key: 'mascot_image', value: configForm.mascot_image }),
      axios.post('/api/config', { key: 'qq_qr_image', value: configForm.qq_qr_image })
    ])
    ElMessage.success('保存成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('保存失败')
  }
}

const purgeRecycleBin = async () => {
  try {
    await ElMessageBox.confirm(
      '清空回收站将永久删除已软删除的记录，且不可恢复。是否继续？',
      '清空回收站',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
    const res = await axios.post('/api/admin/recycle-bin/purge')
    const { activities = 0, members = 0, history = 0 } = res.data?.result || {}
    ElMessage.success(`已清空：活动 ${activities}，成员 ${members}，群史 ${history}`)
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('清空失败')
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="bg-white p-8 rounded-xl shadow-sm border-t-4 border-purple-500">
      <h2 class="font-bold mb-6 text-lg">⚙️ 资源配置</h2>
      <div class="space-y-6">
      <div class="flex justify-between items-center border-b pb-4"><label>主页背景</label><div class="flex gap-2"><img v-if="configForm.home_bg" :src="configForm.home_bg" class="h-10 rounded"><input @change="handleBgUpload" type="file"></div></div>
      <div class="flex justify-between items-center border-b pb-4"><label>加群背景</label><div class="flex gap-2"><img v-if="configForm.join_bg" :src="configForm.join_bg" class="h-10 rounded"><input @change="handleJoinBgUpload" type="file"></div></div>
      <div class="flex justify-between items-center border-b pb-4"><label>徽章</label><div class="flex gap-2"><img v-if="configForm.badge_image" :src="configForm.badge_image" class="h-10 rounded"><input @change="handleBadgeUpload" type="file"></div></div>
      <div class="flex justify-between items-center border-b pb-4"><label>看板娘</label><div class="flex gap-2"><img v-if="configForm.mascot_image" :src="configForm.mascot_image" class="h-10 rounded"><input @change="handleMascotUpload" type="file"></div></div>
      <div class="flex justify-between items-center border-b pb-4"><label>二维码</label><div class="flex gap-2"><img v-if="configForm.qq_qr_image" :src="configForm.qq_qr_image" class="h-10 rounded"><input @change="handleQRUpload" type="file"></div></div>
      <div><label>副标题</label><input v-model="configForm.banner_text" class="w-full border p-2 mt-1"></div>
      <button @click="saveConfig" class="bg-purple-600 text-white px-6 py-2 rounded w-full">保存</button>
      </div>
    </div>

    <div v-if="isSuperAdmin" class="bg-white p-8 rounded-xl shadow-sm border-t-4 border-red-500">
      <h2 class="font-bold mb-2 text-lg">🗑️ 回收站管理</h2>
      <p class="text-sm text-gray-500 mb-4">清空回收站会永久删除已软删除记录，并同步删除对应图片资源。</p>
      <button @click="purgeRecycleBin" class="bg-red-600 text-white px-6 py-2 rounded w-full">清空回收站</button>
    </div>
  </div>
</template>
