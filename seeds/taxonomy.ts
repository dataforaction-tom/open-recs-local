export const THEMATIC_AREAS = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5' },
  { slug: 'operations', name: 'Operations', colorHex: '#059669' },
  { slug: 'finance', name: 'Finance', colorHex: '#d97706' },
  { slug: 'safeguarding', name: 'Safeguarding', colorHex: '#dc2626' },
  { slug: 'engagement', name: 'Engagement', colorHex: '#7c3aed' },
] as const;

export const EVIDENCE_TYPES = [
  { slug: 'document', name: 'Document' },
  { slug: 'url', name: 'URL' },
  { slug: 'internal-note', name: 'Internal note' },
  { slug: 'interview', name: 'Interview' },
] as const;

export const PROGRESS_RATINGS = [
  { slug: 'no-progress', name: 'No progress', weight: 0 },
  { slug: 'some-progress', name: 'Some progress', weight: 25 },
  { slug: 'significant-progress', name: 'Significant progress', weight: 75 },
  { slug: 'fully-implemented', name: 'Fully implemented', weight: 100 },
] as const;
