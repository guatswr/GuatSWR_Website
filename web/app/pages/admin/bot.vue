<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { adminMemberRowSchema } from '@guatswr/shared'
import { memberSyncProfileTaskSchema } from '@guatswr/shared/bot'
import { botSections, botPageLink, botMemberId, resolveBotSection } from '~/utils/admin-bot'
import BotCredentialsPanel from '~/components/admin/BotCredentialsPanel.vue'
import MemberSyncPanel from '~/components/admin/MemberSyncPanel.vue'
import BotProfilesPanel from '~/components/admin/BotProfilesPanel.vue'
import BotDeliveriesPanel from '~/components/admin/BotDeliveriesPanel.vue'
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute(), router = useRouter(), session = useBffSession(), api = useAdminApi()
const isSuperAdmin = session.isSuperAdmin
const section = computed(() => resolveBotSection(route.query.section, isSuperAdmin.value))
const sections = computed(() => botSections.filter(item => !item.super || isSuperAdmin.value))
watch(() => [route.query.section, isSuperAdmin.value], () => {
  if (route.query.section !== undefined && route.query.section !== section.value) void router.replace(botPageLink(section.value, botMemberId(route.query.member)))
}, { immediate: true })
const members = useQuery({ queryKey: ['admin', 'bot-members'], enabled: computed(() => ['sync', 'profiles'].includes(section.value)), queryFn: ({ signal }) => api.request({ resource: 'members', signal }, value => adminMemberRowSchema.array().parse(value)) })
const profiles = useQuery({ queryKey: ['admin', 'member-sync-available'], refetchInterval: 30000, queryFn: ({ signal }) => api.memberSync('profiles', 'GET', undefined, value => {
  if (!value || typeof value !== 'object' || !('available' in value) || typeof value.available !== 'boolean') throw new Error('同步能力响应无效')
  return { available: value.available, items: memberSyncProfileTaskSchema.array().parse('items' in value ? value.items : []) }
}, undefined, signal), retry: false })
async function refreshMembers() { await Promise.all([members.refetch(), profiles.refetch()]) }
</script>
<template>
  <div class="admin-stack">
    <nav class="bot-hub-nav" aria-label="Bot 功能分类"><NuxtLink v-for="item in sections" :key="item.id" class="admin-button" :class="section === item.id ? 'admin-button--primary' : 'admin-button--secondary'" :aria-current="section === item.id ? 'page' : undefined" :to="botPageLink(item.id)">{{ item.label }}<span v-if="item.id === 'profiles' && profiles.data.value?.items.length">({{ profiles.data.value.items.length }})</span></NuxtLink></nav>
    <BotCredentialsPanel v-if="section === 'credentials' && isSuperAdmin" />
    <BotDeliveriesPanel v-else-if="section === 'deliveries' && isSuperAdmin" />
    <template v-else>
      <p v-if="profiles.isPending.value" class="admin-notice" role="status">正在读取 Bot 同步能力…</p>
      <p v-else-if="profiles.isError.value" class="admin-notice admin-notice--error" role="alert">无法读取 Bot 同步信息。<button class="admin-button" @click="profiles.refetch()">重试</button></p>
      <p v-else-if="!profiles.data.value?.available" class="admin-notice">后端尚未启用 Bot 成员同步，请检查平台开关和数据库迁移。</p>
      <MemberSyncPanel v-else-if="section === 'sync' && isSuperAdmin" :members="members.data.value || []" @applied="refreshMembers" />
      <BotProfilesPanel v-else :members="members.data.value || []" :tasks="profiles.data.value?.items || []" :loading="members.isPending.value || profiles.isFetching.value" :failed="members.isError.value" @updated="refreshMembers" @retry="refreshMembers" />
    </template>
  </div>
</template>
<style scoped>
.bot-hub-nav { display: flex; flex-wrap: wrap; gap: 10px; }
</style>
