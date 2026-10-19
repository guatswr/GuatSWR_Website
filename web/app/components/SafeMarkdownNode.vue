<script lang="ts">
/**
 * Thin wrapper: the node renderer lives in `~/utils/safe-markdown-render.ts`
 * (outside `components/`, so Nuxt never tries to register it as a component)
 * so it can be exercised with `vue/server-renderer` in unit tests; the
 * fenced-block chrome is injected from this SFC.
 */
import { defineComponent, h } from 'vue'
import type { PropType, VNodeChild } from 'vue'
import type { SafeMarkdownNode } from '#shared/markdown'
import SafeMarkdownPre from './SafeMarkdownPre.vue'
import { renderSafeNode } from '~/utils/safe-markdown-render'

const renderPre = (language: string | null, children: VNodeChild[]) =>
  h(SafeMarkdownPre, { language }, { default: () => children })

export default defineComponent({
  name: 'SafeMarkdownNode',
  props: {
    node: {
      type: Object as PropType<SafeMarkdownNode>,
      required: true,
    },
  },
  setup(props) {
    return () => renderSafeNode(props.node, renderPre)
  },
})
</script>
