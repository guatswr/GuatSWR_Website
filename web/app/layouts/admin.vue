<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUiStore } from '~/stores/ui'
import { THEME_BOOT_SCRIPT } from '~/utils/theme'
import AdminAvatar from '~/components/admin/Avatar.vue'

const route = useRoute(), session = useBffSession(), ui = useUiStore(usePinia())
const mobileOpen = ref(false), privateVersion = ref(0), loggingOut = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null), mainContent = ref<HTMLElement | null>(null)
function closeMobileNav() { mobileOpen.value = false; menuButton.value?.focus() }
const unregister = session.registerPrivateCleanup(() => { privateVersion.value += 1; mobileOpen.value = false })
onMounted(ui.start)
onBeforeUnmount(() => { unregister(); ui.stop() })
useHead({ title: '管理工作台', meta: [{ name: 'robots', content: 'noindex, nofollow' }], script: [{ key: 'theme-boot', innerHTML: THEME_BOOT_SCRIPT, tagPriority: 'critical' }] })
watch(() => route.fullPath, async () => { mobileOpen.value = false; await nextTick(); mainContent.value?.focus() })
watch(() => session.isSuperAdmin.value, isSuper => {
  if (!isSuper && session.isAuthenticated.value && route.meta.requiresSuperAdmin) void navigateTo('/admin', { replace: true })
})
watch(() => session.state.value.status, status => {
  if (status === 'anonymous') void navigateTo({ path: '/login', query: { redirect: route.fullPath }, replace: true })
})
interface MenuItem { path: string; label: string; icon: string; description: string; super?: boolean }
const sections: { title: string; items: MenuItem[] }[] = [
  { title: '工作空间', items: [
    { path: '/admin', label: '工作台', icon: 'sparkles', description: '常用管理入口与快捷操作' },
    { path: '/admin/activities', label: '文章管理', icon: 'pen', description: '编写活动记录、管理正文与照片' },
    { path: '/admin/events', label: '活动管理', icon: 'calendar', description: '审核投稿、管理活动与参赛结果' },
    { path: '/admin/members', label: '住民管理', icon: 'users', description: '维护成员资料、学校与展示顺序' },
    { path: '/admin/history', label: '群史管理', icon: 'book', description: '记录社群里值得记住的时刻' },
  ] },
  { title: '站点', items: [
    { path: '/admin/config', label: '站点设置', icon: 'sparkles', description: '管理站点资源、介绍与入群信息' },
    { path: '/admin/home-links', label: '首页链接', icon: 'external', description: '编辑公开链接、图标与展示顺序' },
  ] },
  { title: '系统', items: [
    { path: '/admin/logs', label: '操作日志', icon: 'book', description: '查询与管理后台操作记录' },
    { path: '/admin/users', label: '账号与权限', icon: 'users', description: '管理管理员账号、登录与访问限制', super: true },
    { path: '/admin/backups', label: '备份管理', icon: 'calendar', description: '配置自动备份、下载与管理备份文件', super: true },
    { path: '/admin/profile', label: '个人设置', icon: 'pen', description: '更新个人资料与登录安全设置' },
  ] },
]
const visibleSections = computed(() => sections.map(section => ({ ...section, items: section.items.filter(item => !item.super || session.isSuperAdmin.value) })))
const current = computed(() => sections.flatMap(section => section.items).find(item => item.path === route.path)
  ?? { label: '管理工作台', description: '管理社群内容与站点设置' })
async function logout() {
  if (loggingOut.value) return
  try {
    await ElMessageBox.confirm('退出当前管理账号？未保存的修改将不会保留。', '退出登录', { confirmButtonText: '退出登录', cancelButtonText: '继续管理', type: 'warning' })
    loggingOut.value = true
    await session.logout(); await navigateTo('/login')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('退出未完成，请重试')
  } finally { loggingOut.value = false }
}
</script>

<template>
  <div class="admin-shell" data-testid="admin-shell">
    <a class="admin-skip" href="#admin-main">跳到管理内容</a>
    <aside class="admin-sidebar" aria-label="工作空间">
      <NuxtLink class="admin-brand" to="/admin" aria-label="GuatSWR 管理工作台">
        <span class="admin-brand-mark">G</span><span><strong>GuatSWR</strong><small>管理工作台</small></span>
      </NuxtLink>
      <nav class="admin-nav" aria-label="管理导航">
        <section v-for="section in visibleSections" :key="section.title">
          <h2>{{ section.title }}</h2>
          <NuxtLink v-for="item in section.items" :key="item.path" :to="item.path" :aria-current="route.path === item.path ? 'page' : undefined" :class="{ 'is-active': route.path === item.path }">
            <ClubIcon :name="item.icon" /><span>{{ item.label }}</span>
          </NuxtLink>
        </section>
      </nav>
      <div class="admin-sidebar-footer">GuatSWR · 内容与社群</div>
    </aside>
    <div class="admin-workspace">
      <header class="admin-topbar">
        <div class="admin-topbar-start">
          <button ref="menuButton" class="admin-icon-button admin-menu-button" type="button" :aria-expanded="mobileOpen" :aria-controls="mobileOpen ? 'admin-mobile-nav' : undefined" :aria-label="mobileOpen ? '收起管理导航' : '展开管理导航'" @click="mobileOpen = !mobileOpen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path :d="mobileOpen ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'" /></svg>
          </button>
          <NuxtLink class="admin-mobile-brand" to="/admin" aria-label="GuatSWR 管理工作台">GuatSWR <span>管理</span></NuxtLink>
          <span class="admin-topbar-label">社群管理 / {{ current.label }}</span>
        </div>
        <div class="admin-topbar-actions">
          <NuxtLink class="admin-site-link" to="/" target="_blank">访问网站 <ClubIcon name="external" /></NuxtLink>
          <button class="admin-icon-button" type="button" :aria-label="ui.resolvedTheme === 'dark' ? '切换为日间模式' : '切换为夜间模式'" @click="ui.toggleTheme">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path v-if="ui.resolvedTheme === 'dark'" d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /><path v-else d="M20.6 13.1A9 9 0 0 1 10.9 3.4 9 9 0 1 0 20.6 13.1Z" /></svg>
          </button>
          <div class="admin-identity"><AdminAvatar :src="session.user.value?.avatar" :name="session.user.value?.username" /><span class="admin-identity-text"><strong>{{ session.user.value?.username }}</strong><small>{{ session.isSuperAdmin.value ? '超级管理员' : '管理员' }}</small></span></div>
          <button class="admin-button admin-button--quiet" type="button" :disabled="loggingOut" @click="logout">退出</button>
        </div>
      </header>
      <nav v-if="mobileOpen" id="admin-mobile-nav" class="admin-mobile-nav" aria-label="移动管理导航" @keydown.esc="closeMobileNav">
        <section v-for="section in visibleSections" :key="section.title"><h2>{{ section.title }}</h2><NuxtLink v-for="item in section.items" :key="item.path" :to="item.path" :aria-current="route.path === item.path ? 'page' : undefined"><ClubIcon :name="item.icon" />{{ item.label }}</NuxtLink></section>
      </nav>
      <main id="admin-main" ref="mainContent" class="admin-main" tabindex="-1">
        <div class="admin-page-heading"><div><p>GUAT TOUHOU · ADMIN</p><h1>{{ current.label }}</h1><span>{{ current.description }}</span></div></div>
        <div :key="privateVersion" class="admin-content"><slot /></div>
      </main>
    </div>
  </div>
</template>
