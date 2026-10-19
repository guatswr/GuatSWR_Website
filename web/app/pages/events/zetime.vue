<script setup lang="ts">
import EventBoard from '~/components/events/EventBoard.vue'
</script>

<template>
  <EventBoard
    type="则则"
    title="则则"
    subtitle="则批大本营，欢迎各位则批报名参加！"
    allow-create-mode="none"
    :enable-signup="true"
  />
</template>
