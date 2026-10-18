import { storeToRefs } from 'pinia'
import { useUiStore } from '~/stores/ui'

export function useTheme() {
  const ui = useUiStore(usePinia())
  const { themeMode, resolvedTheme } = storeToRefs(ui)
  return { themeMode, isDark: computed(() => resolvedTheme.value === 'dark'), toggleTheme: ui.toggleTheme }
}
