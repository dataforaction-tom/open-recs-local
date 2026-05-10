// Minimal hast shape so we don't pull @types/hast as a direct devDep.
// The full types live under hast/* in the typed unified ecosystem; we only
// need the two fields we actually touch.
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};
type HastRoot = HastNode & { type: 'root'; children: HastNode[] };

export type RewriteStorageImagesOptions = {
  /** Map of storage key → signed URL. Keys not present are left untouched. */
  urlsByKey: Record<string, string>;
};

type Node = HastNode;

function walk(node: Node | null | undefined, urlsByKey: Record<string, string>): void {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'element' && node.tagName === 'img') {
    const src = node.properties?.['src'];
    if (typeof src === 'string') {
      const replacement = urlsByKey[src];
      if (replacement && node.properties) node.properties['src'] = replacement;
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, urlsByKey);
  }
}

/**
 * Rehype-style plugin factory that rewrites <img src> when the value matches
 * a storage key in `urlsByKey`. Returns a transformer rather than the unified
 * plugin shape so SourceMarkdown can pass it directly into react-markdown's
 * `rehypePlugins` array. Hand-rolled tree walk — unist-util-visit is
 * transitive only and adding it as a direct dep isn't worth ~25 LOC.
 */
export function rewriteStorageImages(opts: RewriteStorageImagesOptions): (tree: HastRoot) => void {
  return (tree: HastRoot) => walk(tree, opts.urlsByKey);
}
