import { describe, expect, it } from 'vitest';
import {
  buildPass1Prompt,
  buildPass2LooserPrompt,
  buildPass2StrictPrompt,
  type TaxonomySlugLists,
} from './extraction-prompts';

const slugs: TaxonomySlugLists = {
  thematic_area: ['governance', 'data'],
  source_type: ['evaluation'],
  purpose: ['strategy'],
  role_relevance: ['policy-maker'],
  target_audience_type: ['funders'],
  location_scope: ['national'],
  priority_timescale: ['urgent'],
};

describe('buildPass1Prompt', () => {
  it('lists every multi-select axis slug in the prompt body', () => {
    const prompt = buildPass1Prompt(slugs);
    expect(prompt).toContain('"governance"');
    expect(prompt).toContain('"evaluation"');
    expect(prompt).toContain('"strategy"');
    expect(prompt).toContain('"policy-maker"');
    expect(prompt).toContain('"funders"');
  });

  it('instructs the model to return a new slug when none in the list fits', () => {
    const prompt = buildPass1Prompt(slugs);
    expect(prompt.toLowerCase()).toContain('new slug');
  });

  it('lists the exact output fields by name', () => {
    const prompt = buildPass1Prompt(slugs);
    for (const field of [
      'summary',
      'authors',
      'publication_date',
      'org_owner',
      'thematic_area_slugs',
      'source_type_slugs',
      'purpose_slugs',
      'role_relevance_slugs',
      'target_audience_type_slugs',
    ]) {
      expect(prompt).toContain(field);
    }
  });
});

describe('buildPass2StrictPrompt', () => {
  it('emphasises "actionable" and warns against needs/wants statements', () => {
    const prompt = buildPass2StrictPrompt(slugs);
    expect(prompt.toLowerCase()).toContain('actionable');
    expect(prompt.toLowerCase()).toContain('needs');
  });

  it('requires a confidence enum value', () => {
    const prompt = buildPass2StrictPrompt(slugs);
    expect(prompt).toContain('confidence');
    expect(prompt).toMatch(/high.*medium.*low/);
  });

  it('lists Pass 2 axis slugs (themes, purposes, audiences, locations, priorities)', () => {
    const prompt = buildPass2StrictPrompt(slugs);
    expect(prompt).toContain('"governance"');
    expect(prompt).toContain('"funders"');
    expect(prompt).toContain('"national"');
    expect(prompt).toContain('"urgent"');
  });
});

describe('buildPass2LooserPrompt', () => {
  it('instructs the model to extract from anywhere in the document', () => {
    const prompt = buildPass2LooserPrompt(slugs);
    expect(prompt.toLowerCase()).toContain('full document');
  });

  it('still requires confidence + lists axis slugs', () => {
    const prompt = buildPass2LooserPrompt(slugs);
    expect(prompt).toContain('confidence');
    expect(prompt).toContain('"governance"');
  });
});
