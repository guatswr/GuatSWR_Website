import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { DEFAULT_JOIN_QUESTION, parseHomeLinks } from '../utils/siteConfig'

const defaults = {
  home_bg: '',
  join_bg: '',
  banner_text: '',
  badge_image: '',
  mascot_image: '',
  qq_qr_image: '',
  home_links: '',
  qq_group_number: '',
  qq_join_url: '',
  join_question: DEFAULT_JOIN_QUESTION
}

export const useSiteConfigStore = defineStore('siteConfig', () => {
  const config = ref({ ...defaults })
  const loading = ref(false)
  const error = ref('')
  const socialLinks = computed(() => parseHomeLinks(config.value.home_links))
  let loaded = false
  let inflight = null

  const load = ({ force = false } = {}) => {
    if (inflight) return inflight
    if (loaded && !force) return Promise.resolve(config.value)

    loading.value = true
    error.value = ''
    inflight = axios.get('/api/config', { timeout: 10000 })
      .then(({ data }) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Invalid site configuration')
        }
        config.value = { ...defaults, ...data }
        loaded = true
        return config.value
      })
      .catch(() => {
        error.value = '暂时无法加载社团信息，请稍后重试。'
        return null
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })
    return inflight
  }

  return { config, loading, error, socialLinks, load }
})
