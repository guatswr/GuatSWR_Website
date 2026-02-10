<script setup>
import EventBoard from '../../components/events/EventBoard.vue'
</script>

<template>
  <EventBoard
    type="stg"
    title="STG"
    subtitle="空战挑战开启，报名后等待战绩录入。"
    allow-create-mode="none"
    :enable-signup="true"
  />
</template>