<script setup>
defineProps({ name: { type: String, default: 'sparkles' } })
const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  external: 'M7 17 17 7M7 7h10v10',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  game: 'M7 7h10a4 4 0 0 1 3.9 3.1l1 5a3 3 0 0 1-5 2.8L15 16H9l-1.9 1.9a3 3 0 0 1-5-2.8l1-5A4 4 0 0 1 7 7ZM7 10v4m-2-2h4m6-1h.01M18 13h.01',
  music:
    'M9 18V5l11-2v13M9 8l11-2M9 18c0 1.7-1.8 3-4 3s-3-1-3-2 1.8-3 4-3c1.2 0 2.3.4 3 1m11-1c0 1.7-1.8 3-4 3s-3-1-3-2 1.8-3 4-3c1.2 0 2.3.4 3 1',
  pen: 'm15 5 4 4M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15l-1 6 6-1',
  calendar:
    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  book: 'M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3V3Z',
  snow: 'M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1'
}
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.sparkles" />
  </svg>
</template>
