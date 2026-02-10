<script setup>
import EventBoard from '../../components/events/EventBoard.vue'
</script>

<template>
  <EventBoard
  type="STG"
    title="STG"
    subtitle="欢迎STGer报名参加！"
    allow-create-mode="none"
    :enable-signup="true"
  />
</template>