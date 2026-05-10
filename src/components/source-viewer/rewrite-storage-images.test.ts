import { describe, expect, it } from 'vitest';
import { rewriteStorageImages } from './rewrite-storage-images';

type TestNode = {
  type: 'element' | 'root' | 'text';
  tagName?: string;
  properties?: Record<string, unknown>;
  children: TestNode[];
};

type TestRoot = TestNode & { type: 'root' };

function img(src: string): TestNode {
  return {
    type: 'element',
    tagName: 'img',
    properties: { src, alt: '' },
    children: [],
  };
}

function tree(...children: TestNode[]): TestRoot {
  return { type: 'root', children };
}

// Cast helper — the rehype rewriter is typed against hast's exact Root shape
// but our test fixture is a structural equivalent.
function run(transform: (t: unknown) => void, root: TestRoot): void {
  transform(root);
}

describe('rewriteStorageImages', () => {
  it('rewrites a known storage-key src to its signed URL', () => {
    const transform = rewriteStorageImages({ urlsByKey: { 'src/abc/page-1.png': '/api/files/T1' } });
    const root = tree(img('src/abc/page-1.png'));
    run(transform as (t: unknown) => void, root);
    expect((root.children[0] as TestNode).properties!.src).toBe('/api/files/T1');
  });

  it('leaves an external URL untouched', () => {
    const transform = rewriteStorageImages({ urlsByKey: {} });
    const root = tree(img('https://example.com/foo.png'));
    run(transform as (t: unknown) => void, root);
    expect((root.children[0] as TestNode).properties!.src).toBe('https://example.com/foo.png');
  });

  it('leaves an unknown storage key untouched', () => {
    const transform = rewriteStorageImages({ urlsByKey: { 'src/abc/page-1.png': '/api/files/T1' } });
    const root = tree(img('src/unknown/key.png'));
    run(transform as (t: unknown) => void, root);
    expect((root.children[0] as TestNode).properties!.src).toBe('src/unknown/key.png');
  });

  it('handles multiple images in one document', () => {
    const transform = rewriteStorageImages({
      urlsByKey: { 'a.png': '/api/files/T-A', 'b.png': '/api/files/T-B' },
    });
    const root = tree(img('a.png'), img('b.png'));
    run(transform as (t: unknown) => void, root);
    expect((root.children[0] as TestNode).properties!.src).toBe('/api/files/T-A');
    expect((root.children[1] as TestNode).properties!.src).toBe('/api/files/T-B');
  });

  it('is a no-op for non-img elements', () => {
    const transform = rewriteStorageImages({ urlsByKey: { 'a.png': '/api/files/T-A' } });
    const link: TestNode = {
      type: 'element',
      tagName: 'a',
      properties: { href: 'a.png' },
      children: [],
    };
    const root = tree(link);
    run(transform as (t: unknown) => void, root);
    expect((root.children[0] as TestNode).properties!.href).toBe('a.png');
  });
});
