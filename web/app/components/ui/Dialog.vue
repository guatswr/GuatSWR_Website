<script setup lang="ts">
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'
defineProps<{ title: string, description: string }>()
</script>

<template>
  <DialogRoot>
    <DialogTrigger as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[60] bg-slate-950/55" />
      <DialogContent class="club-paper fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded p-6 shadow-xl focus:outline-none">
        <DialogTitle class="club-section-title pr-8">{{ title }}</DialogTitle>
        <DialogDescription class="mt-3 text-sm leading-7 text-slate-500">{{ description }}</DialogDescription>
        <div class="mt-5"><slot /></div>
        <DialogClose aria-label="关闭对话框" class="absolute right-3 top-3 grid size-11 place-items-center text-xl">×</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
