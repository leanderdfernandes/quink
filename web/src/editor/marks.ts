import Link from '@tiptap/extension-link'

// The link mark, extended so it can carry WHICH article it points at rather than only where
// that article happened to live when the link was made.
//
// Slugs are NOT immutable: an article can be renamed, refiled or deleted, so a stored href
// is a guess that goes stale. `data-article-id` is the truth and publish is where the truth
// becomes a URL — lib/articleLinks.ts rewrites every anchor to its target's CURRENT slug,
// and unwraps the ones that no longer resolve so a reader never meets a dead link.
//
// It lives here, and not in the panel that happens to use it, because BOTH answer editors
// and step bodies mount it. Two copies would be two mark types with the same name and one
// of them would quietly stop round-tripping.
export const ArticleLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      articleId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-article-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.articleId ? { 'data-article-id': attrs.articleId } : {},
      },
    }
  },
})
