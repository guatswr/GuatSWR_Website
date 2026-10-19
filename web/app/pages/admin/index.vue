<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
const session = useBffSession()
const actions = computed(() => [
  { title: '维护住民资料', description: '新增成员，更新头像、学校和成分标签。', path: '/admin/members', icon: 'users' },
  { title: '记录社群群史', description: '把新动态整理到公开时间轴。', path: '/admin/history', icon: 'book' },
  { title: '更新站点设置', description: '调整网站资源、介绍和入群信息。', path: '/admin/config', icon: 'sparkles' },
  { title: '管理首页链接', description: '整理常用社群入口与公开链接。', path: '/admin/home-links', icon: 'external' },
  { title: '查看操作日志', description: '查阅近期管理操作，定位需要关注的变更。', path: '/admin/logs', icon: 'book' },
  ...(session.isSuperAdmin.value ? [{ title: '管理站点备份', description: '设置备份计划，下载和管理备份文件。', path: '/admin/backups', icon: 'calendar' }] : []),
])
</script>
<template>
  <div>
  <section class="admin-welcome"><div><p>欢迎回来</p><h2>{{ session.user.value?.username }}，从这里开始管理。</h2><span>选择一项工作，查看并更新站点内容。</span></div><NuxtLink class="admin-button admin-button--secondary" to="/admin/profile">个人设置 <ClubIcon name="arrow" /></NuxtLink></section>
  <div class="admin-quick-grid"><NuxtLink v-for="action in actions" :key="action.path" :to="action.path" class="admin-quick-card"><span class="admin-quick-icon"><ClubIcon :name="action.icon" /></span><h2>{{ action.title }}</h2><p>{{ action.description }}</p><span class="admin-quick-action">打开 <ClubIcon name="arrow" /></span></NuxtLink></div>
  </div>
</template>
