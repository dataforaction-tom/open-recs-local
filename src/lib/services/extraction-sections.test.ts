import { describe, expect, it } from 'vitest';
import { detectRecommendationSections } from './extraction-sections';

describe('detectRecommendationSections', () => {
  it('returns mode=full-document when no recommendation heading is found', () => {
    const md = '# About\n\nSome text.\n\n# Methodology\n\nMore text.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('full-document');
    expect(result.processText).toBe(md);
  });

  it('detects "# Recommendations" and slices from heading to end of doc', () => {
    const md = '# Intro\n\nIntro text.\n\n# Recommendations\n\n1. Do X.\n2. Do Y.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Recommendations');
    expect(result.processText).toContain('Do X');
    expect(result.processText).not.toContain('Intro text');
  });

  it('detects "# Next steps" as a recommendation section', () => {
    const md = '# Background\n\nText.\n\n# Next steps\n\nAct now.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Next steps');
  });

  it('detects "# Conclusions and recommendations"', () => {
    const md = '# Setup\n\nA.\n\n# Conclusions and recommendations\n\nFoo.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('Conclusions and recommendations');
  });

  it('detects "# Actions"', () => {
    const md = '# Findings\n\nText.\n\n# Actions\n\nDo this.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Actions');
  });

  it('detects "# We will" as a commitment-style section', () => {
    const md = '# Context\n\nText.\n\n# We will\n\nCommit to X.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('We will');
  });

  it('concatenates multiple matched sections', () => {
    const md = '# Intro\n\nA.\n\n# Recommendations\n\n1. X.\n\n# About\n\nIgnore.\n\n# Next steps\n\nY.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Recommendations');
    expect(result.processText).toContain('# Next steps');
  });

  it('stops each section at the next non-recommendation major heading', () => {
    const md = '# Recommendations\n\n1. X.\n\n# Appendix\n\nDo not include.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('1. X.');
    expect(result.processText).not.toContain('Do not include');
  });

  it('is case-insensitive on the heading text', () => {
    const md = '# RECOMMENDATIONS\n\n1. X.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
  });

  it('does not match recommendation-like words inside body text', () => {
    const md = '# About\n\nThe recommendations of this report are summarised below.\n\n# Methodology\n\nText.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('full-document');
  });
});
