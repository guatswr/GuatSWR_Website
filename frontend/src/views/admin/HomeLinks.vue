<script setup>
import { reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import HomeSocialLinks from '../../components/HomeSocialLinks.vue'

const form = reactive({
  links: []
})

const defaultLinks = [
  {
    title: 'Bilibili 官方账号',
    subtitle: 'UID: 444257435',
    extra: '投稿联系管理员: Taropoi',
    url: 'https://space.bilibili.com/444257435',
    iconText: 'B'
  },
  {
    title: 'QQ 直播频道',
    subtitle: '游戏直播分享',
    extra: '点击加入频道',
    url: 'https://pd.qq.com/s/fxsvvaqqt',
    iconText: '🎮'
  }
]

const withDefaults = (item) => ({
  title: '',
  subtitle: '',
  extra: '',
  url: '',
  iconText: '',
  iconUrl: '',
  iconBg: '',
  iconColor: '',
  textColor: '',
  textColorAuto: false,
  cardBg: '',
  cardBgAuto: false,
  showOnHome: true,
  ...item
})

const fetchConfig = async () => {
  try {
    const res = await axios.get('/api/config')
    if (res.data?.home_links) {
      const parsed = JSON.parse(res.data.home_links)
      form.links = Array.isArray(parsed) ? parsed.map(withDefaults) : []
    } else {
      form.links = JSON.parse(JSON.stringify(defaultLinks)).map(withDefaults)
    }
  } catch (e) {
    form.links = JSON.parse(JSON.stringify(defaultLinks)).map(withDefaults)
    ElMessage.error('加载配置失败')
  }
}

onMounted(() => {
  fetchConfig()
})

const addLink = () => {
  form.links.push(withDefaults({
    title: '新链接',
    subtitle: '副标题',
    extra: '简短说明（建议 6-12 字）',
    url: 'https://',
    iconText: '◆',
    cardBgAuto: true
  }))
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
  try {
    await ElMessageBox.confirm('确认保存外链模块配置？', '确认保存', { type: 'warning' })
    await axios.post('/api/config', { key: 'home_links', value: JSON.stringify(form.links) })
    ElMessage.success('保存成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('保存失败')
  }
}

const uploadIcon = async (file, item) => {
  if (!file) return
  const d = new FormData()
  d.append('file', file)
  const r = await axios.post('/api/upload?category=icon_svg', d)
  item.iconUrl = r.data.url
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-6">
    <div class="bg-white p-8 rounded-xl shadow-sm border-t-4 border-pink-500">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-bold text-lg">🔗 首页外链模块</h2>
        <button @click="addLink" class="text-sm px-3 py-1 rounded bg-pink-100 text-pink-600 hover:bg-pink-200">新增</button>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        配置会同步展示在首页与外链聚合页，支持图标、颜色与卡片背景的个性化设置。
      </p>

      <div class="space-y-4">
        <div v-for="(item, idx) in form.links" :key="idx" class="border rounded-lg p-4 bg-gray-50">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-bold text-gray-700">卡片 {{ idx + 1 }}</span>
            <div class="flex items-center gap-2">
              <button @click="moveLink(idx, 'up')" class="text-xs text-gray-500">▲</button>
              <button @click="moveLink(idx, 'down')" class="text-xs text-gray-500">▼</button>
              <button @click="removeLink(idx)" class="text-xs text-red-500">移除</button>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500">标题</label>
              <input v-model="item.title" class="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">副标题</label>
              <input v-model="item.subtitle" class="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">说明文字（显示在副标题下方）</label>
              <input v-model="item.extra" class="w-full border rounded px-2 py-1" placeholder="简短一句即可" />
            </div>
            <div>
              <label class="text-xs text-gray-500">链接</label>
              <input v-model="item.url" class="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">图标文字</label>
              <input v-model="item.iconText" class="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">图标背景色</label>
              <input v-model="item.iconBg" type="color" class="w-full h-9 border rounded px-2 py-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">图标文字色</label>
              <input v-model="item.iconColor" type="color" class="w-full h-9 border rounded px-2 py-1" />
            </div>
            <div>
              <label class="text-xs text-gray-500">卡片背景色</label>
              <input
                v-model="item.cardBg"
                type="color"
                class="w-full h-9 border rounded px-2 py-1"
                :disabled="item.cardBgAuto"
                :class="{ 'opacity-50 cursor-not-allowed': item.cardBgAuto }"
              />
              <div class="text-[11px] text-gray-400 mt-1">留空则使用系统配色</div>
            </div>
            <div class="flex items-start gap-2">
              <input v-model="item.cardBgAuto" type="checkbox" class="mt-1" />
              <div>
                <label class="text-xs text-gray-500">自动配置颜色</label>
                <div class="text-[11px] text-gray-400">根据图标背景色自动生成柔和的卡片底色</div>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500">说明文字颜色</label>
              <input
                v-model="item.textColor"
                type="color"
                class="w-full h-9 border rounded px-2 py-1"
                :disabled="item.textColorAuto"
                :class="{ 'opacity-50 cursor-not-allowed': item.textColorAuto }"
              />
              <div class="text-[11px] text-gray-400 mt-1">仅影响说明文字</div>
            </div>
            <div class="flex items-start gap-2">
              <input v-model="item.textColorAuto" type="checkbox" class="mt-1" />
              <div>
                <label class="text-xs text-gray-500">说明文字自动配色</label>
                <div class="text-[11px] text-gray-400">根据图标背景色生成更深的文字色</div>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <input v-model="item.showOnHome" type="checkbox" class="mt-1" />
              <div>
                <label class="text-xs text-gray-500">在首页展示</label>
                <div class="text-[11px] text-gray-400">关闭后仅外链页展示</div>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500">图标 SVG 链接</label>
              <input v-model="item.iconUrl" class="w-full border rounded px-2 py-1" placeholder="/uploads/... 或 https://" />
            </div>
            <div>
              <label class="text-xs text-gray-500">上传 SVG 图标</label>
              <input type="file" accept="image/svg+xml" @change="(e) => uploadIcon(e.target.files?.[0], item)" class="w-full" />
            </div>
          </div>
        </div>
      </div>

      <button @click="saveLinks" class="mt-6 w-full bg-pink-600 text-white py-2 rounded">保存</button>
    </div>

    <div class="bg-white p-8 rounded-xl shadow-sm border-t-4 border-purple-500 h-fit">
      <h3 class="font-bold text-lg mb-4">👀 实时预览</h3>
      <div class="bg-gray-50 border rounded-xl p-4">
        <HomeSocialLinks :links="form.links" />
      </div>
    </div>
  </div>
</template>
