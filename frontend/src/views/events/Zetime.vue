<script setup>
import EventBoard from '../../components/events/EventBoard.vue'
</script>

<template>
  <EventBoard
    type="match"
    title="则赛"
    subtitle="报名挑战制胜规则，战绩将进入桂航排行。"
    allow-create-mode="none"
    :enable-signup="true"
  />
</template>