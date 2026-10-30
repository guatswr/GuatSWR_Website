<script setup lang="ts">
import EventBoard from '~/components/events/EventBoard.vue'
</script>

<template>
  <EventBoard type="STG" title="STG" allow-create-mode="none" :enable-signup="true" />
</template>
