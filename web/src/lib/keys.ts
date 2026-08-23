import { isMacOS } from '@tiptap/core'

// Platform-correct modifier GLYPHS. Nothing here binds a key — the bindings are TipTap's
// and the browser's, and they are already correct on every platform. This module only
// decides how to WRITE them, so a tooltip, a panel footer and the editor's hint line cannot
// disagree with each other or with the keyboard in front of the user.
//
// The join differs and it is the tell that it was an afterthought: macOS renders ⌘B with no
// separator, Windows and Linux render Ctrl+B with one.

const IS_MAC =
  typeof isMacOS === 'function'
    ? isMacOS()
    : /mac/i.test(
        (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
          navigator.platform ??
          '',
      )

export const MOD = IS_MAC ? '⌘' : 'Ctrl'
export const ALT = IS_MAC ? '⌥' : 'Alt'
export const SHIFT = IS_MAC ? '⇧' : 'Shift'

/** `⌘B` on macOS, `Ctrl+B` everywhere else. */
export const key = (k: string): string => (IS_MAC ? `${MOD}${k}` : `${MOD}+${k}`)
