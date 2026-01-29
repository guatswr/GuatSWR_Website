<script setup>
import { reactive, ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
// 假设组件路径正确，保留引用
import HomeSocialLinks from '../../components/HomeSocialLinks.vue'

const loading = ref(false)
const saveLoading = ref(false)
// 记录正在上传图标的索引
const uploadingIndex = ref(-1)

const form = reactive({
  links: []
})

const defaultLinks = [
  {
    title: 'Bilibili 官方账号',
    subtitle: 'UID: 444257435',
    extra: '投稿联系管理员: Taropoi',
    url: 'https://space.bilibili.com/444257435',
    iconText: 'B',
    // 补全默认样式字段，防止 undefined
    iconBg: '#00a1d6',
    iconColor: '#ffffff',
    cardBgAuto: true
  },
  {
    title: 'QQ 直播频道',
    subtitle: '游戏直播分享',
    extra: '点击加入频道',
    url: 'https://pd.qq.com/s/fxsvvaqqt',
    iconText: '🎮',
    iconBg: '#666666',
    iconColor: '#ffffff',
    cardBgAuto: true
  }
]

const withDefaults = (item) => ({
  title: '',
  subtitle: '',
  extra: '',
  url: '',
  iconText: '',
  iconUrl: '',
  iconBg: '#000000',
  iconColor: '#ffffff',
  textColor: '#666666',
  textColorAuto: false,
  cardBg: '#ffffff',
  cardBgAuto: false,
  showOnHome: true,
  ...item
})

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/config')
    if (res.data?.home_links) {
      try {
        const parsed = JSON.parse(res.data.home_links)
        form.links = Array.isArray(parsed) ? parsed.map(withDefaults) : []
      } catch (parseErr) {
        console.error('JSON Parse Error:', parseErr)
        form.links = []
      }
    } else {
      // 如果没有配置，加载默认值
      form.links = JSON.parse(JSON.stringify(defaultLinks)).map(withDefaults)
    }
  } catch (e) {
    ElMessage.error('加载配置失败')
    form.links = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchConfig()
})

const addLink = () => {
  form.links.push(withDefaults({
    title: '新链接',
    subtitle: '副标题',
    extra: '简短说明',
    url: 'https://',
    iconText: '★',
    cardBgAuto: true,
    iconBg: '#3b82f6'
  }))
  // 滚动到底部
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, 100)
}

const removeLink = (index) => {
  form.links.splice(index, 1)
}

const moveLink = (index, dir) => {
  const target = dir === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= form.links.length) return
  const temp = form.links[index]
  form.links[index] = form.links[target]
  form.links[target] = temp
}

const saveLinks = async () => {
  // 简单校验
  if (form.links.some(l => !l.title)) {
    ElMessage.warning('存在未填写标题的卡片，请检查')
    return
  }

  saveLoading.value = true
  try {
    // await ElMessageBox.confirm('确认保存外链模块配置？', '确认保存', { type: 'warning' })
    await axios.post('/api/config', { key: 'home_links', value: JSON.stringify(form.links) })
    ElMessage.success('保存成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('保存失败')
  } finally {
    saveLoading.value = false
  }
}

const uploadIcon = async (file, item, index) => {
  if (!file) return
  
  uploadingIndex.value = index
  try {
    const d = new FormData()
    d.append('file', file)
    const r = await axios.post('/api/upload?category=icon_svg', d)
    item.iconUrl = r.data.url
    ElMessage.success('图标上传成功')
  } catch (e) {
    ElMessage.error('图标上传失败')
  } finally {
    uploadingIndex.value = -1
  }
}
</script>

<template>
  <div class="grid lg:grid-cols-12 gap-6 items-start">
    <!-- 左侧：编辑区域 (占 7 列) -->
    <div class="lg:col-span-7 bg-white p-6 rounded-xl shadow-sm border-t-4 border-pink-500">
      <div class="flex items-center justify-between mb-4 sticky top-0 bg-white z-10 py-2 border-b border-gray-100">
        <div>
           <h2 class="font-bold text-lg text-gray-800">🔗 首页外链配置</h2>
           <p class="text-xs text-gray-500">拖拽或点击箭头排序，实时生效于右侧预览</p>
        </div>
        <div class="flex gap-2">
            <button @click="addLink" class="text-sm px-4 py-2 rounded-lg bg-pink-50 text-pink-600 hover:bg-pink-100 font-bold transition flex items-center gap-1">
                <span>➕</span> 新增卡片
            </button>
            <button @click="saveLinks" :disabled="saveLoading" class="text-sm px-4 py-2 rounded-lg bg-pink-600 text-white hover:bg-pink-700 font-bold transition flex items-center gap-1 disabled:opacity-50">
                <span v-if="saveLoading" class="animate-spin">🔄</span> 保存
            </button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-10 text-gray-400">
        <span class="animate-spin text-2xl block mb-2">⏳</span> 加载配置中...
      </div>

      <div v-else class="space-y-6">
        <div v-for="(item, idx) in form.links" :key="idx" class="border rounded-xl p-0 bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden group">
          <!-- 卡片头部工具栏 -->
          <div class="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-100">
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-gray-500 bg-white border px-1.5 rounded">#{{ idx + 1 }}</span>
                <span class="text-sm font-bold text-gray-700 truncate max-w-[150px]">{{ item.title || '未命名卡片' }}</span>
            </div>
            <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              <button @click="moveLink(idx, 'up')" class="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-30" :disabled="idx === 0">⬆️</button>
              <button @click="moveLink(idx, 'down')" class="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-30" :disabled="idx === form.links.length - 1">⬇️</button>
              <div class="w-px h-4 bg-gray-300 mx-1"></div>
              <button @click="removeLink(idx)" class="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded font-medium">移除</button>
            </div>
          </div>

          <div class="p-4 space-y-4">
            <!-- 第一行：基础信息 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-3">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">基础内容</h4>
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">标题</label>
                        <input v-model="item.title" class="w-full border rounded px-2 py-1.5 focus:ring-2 focus:ring-pink-100 outline-none" placeholder="例如：B站账号" />
                    </div>
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">副标题</label>
                        <input v-model="item.subtitle" class="w-full border rounded px-2 py-1.5 focus:ring-2 focus:ring-pink-100 outline-none" placeholder="例如：UID: 123456" />
                    </div>
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">说明 (Extra)</label>
                        <input v-model="item.extra" class="w-full border rounded px-2 py-1.5 focus:ring-2 focus:ring-pink-100 outline-none" placeholder="底部的小字说明" />
                    </div>
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">跳转链接</label>
                        <input v-model="item.url" class="w-full border rounded px-2 py-1.5 focus:ring-2 focus:ring-pink-100 outline-none font-mono text-xs" placeholder="https://..." />
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                        <input v-model="item.showOnHome" type="checkbox" :id="`show-${idx}`" class="rounded text-pink-600 focus:ring-pink-500" />
                        <label :for="`show-${idx}`" class="text-xs text-gray-600 cursor-pointer select-none">在首页显示此卡片</label>
                    </div>
                </div>

                <div class="space-y-3 border-l pl-4 border-gray-100">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">外观与图标</h4>
                    
                    <!-- 图标配置 -->
                    <div class="flex gap-2">
                        <div class="flex-1">
                             <label class="text-xs text-gray-500 mb-1 block">图标字符 (Emoji/字)</label>
                             <input v-model="item.iconText" class="w-full border rounded px-2 py-1.5 text-center" placeholder="B" />
                        </div>
                        <div class="flex-1 relative">
                             <label class="text-xs text-gray-500 mb-1 block">或上传图标</label>
                             <label class="block w-full border border-dashed rounded px-2 py-1.5 text-center text-xs text-gray-500 cursor-pointer hover:bg-gray-50 truncate">
                                 {{ uploadingIndex === idx ? '上传中...' : (item.iconUrl ? '已上传(点击更换)' : '点击上传 SVG') }}
                                 <input type="file" accept="image/svg+xml,image/png" @change="(e) => uploadIcon(e.target.files?.[0], item, idx)" class="hidden" />
                             </label>
                        </div>
                    </div>

                    <!-- 颜色配置 -->
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-xs text-gray-500 mb-1 block">图标背景</label>
                            <div class="flex items-center gap-1 border rounded p-1">
                                <input v-model="item.iconBg" type="color" class="w-6 h-6 border-0 p-0 rounded cursor-pointer" />
                                <span class="text-[10px] font-mono text-gray-400">{{ item.iconBg }}</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-gray-500 mb-1 block">图标颜色</label>
                            <div class="flex items-center gap-1 border rounded p-1">
                                <input v-model="item.iconColor" type="color" class="w-6 h-6 border-0 p-0 rounded cursor-pointer" />
                                <span class="text-[10px] font-mono text-gray-400">{{ item.iconColor }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 自动配色开关 -->
                    <div class="bg-gray-50 p-2 rounded text-xs space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-gray-600">卡片底色自动适配</span>
                            <div class="flex items-center gap-2">
                                <input v-if="!item.cardBgAuto" v-model="item.cardBg" type="color" class="w-4 h-4 p-0 border-0" />
                                <input v-model="item.cardBgAuto" type="checkbox" class="rounded text-pink-600" />
                            </div>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-gray-600">文字颜色自动适配</span>
                            <div class="flex items-center gap-2">
                                <input v-if="!item.textColorAuto" v-model="item.textColor" type="color" class="w-4 h-4 p-0 border-0" />
                                <input v-model="item.textColorAuto" type="checkbox" class="rounded text-pink-600" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
        
        <button @click="addLink" class="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-pink-300 hover:text-pink-500 hover:bg-pink-50 transition font-bold">
            + 添加新链接卡片
        </button>
      </div>
    </div>

    <!-- 右侧：实时预览 (占 5 列，Sticky) -->
    <div class="lg:col-span-5 sticky top-24 h-fit">
      <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
            👀 效果预览 
            <span class="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">实时</span>
        </h3>
        <div class="bg-gray-100/50 border border-gray-200 rounded-xl p-4 min-h-[200px]">
            <!-- 模拟首页环境 -->
             <div class="text-center mb-4">
                <span class="text-xs text-gray-400">--- 首页组件模拟展示 ---</span>
            </div>
            
            <HomeSocialLinks :links="form.links" />
            
             <div class="text-center mt-4" v-if="form.links.length === 0">
                <span class="text-xs text-gray-400">暂无配置链接</span>
            </div>
        </div>
        <div class="mt-4 text-xs text-gray-500 leading-relaxed">
            <p>💡 提示：</p>
            <ul class="list-disc pl-4 space-y-1">
                <li>勾选“自动适配”后，系统会根据<strong>图标背景色</strong>自动计算浅色的卡片背景和深色的文字颜色。</li>
                <li>上传 SVG 图标效果最佳，支持矢量缩放。</li>
                <li>建议将重要链接置顶。</li>
            </ul>
        </div>
      </div>
    </div>
  </div>
</template>