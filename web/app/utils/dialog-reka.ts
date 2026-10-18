// Static named re-exports keep the reka-ui dialog runtime tree-shaken to the
// dialog primitives only. `Dialog.vue` imports this module lazily on first
// open; importing the reka-ui package index dynamically would pull every
// component in the library (~750 KB raw, ~185 KB gzip).
export {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
