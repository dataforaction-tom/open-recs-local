export const THEMATIC_AREAS = [
  { slug: 'arts-culture', name: 'Arts & Culture', colorHex: '#f59e0b' },
  { slug: 'climate-change', name: 'Climate Change', colorHex: '#0ea5e9' },
  { slug: 'education', name: 'Education', colorHex: '#a855f7' },
  { slug: 'healthcare', name: 'Healthcare', colorHex: '#ef4444' },
  { slug: 'housing', name: 'Housing', colorHex: '#f97316' },
  { slug: 'heritage', name: 'Heritage', colorHex: '#b45309' },
  { slug: 'children-young-people', name: 'Children & Young People', colorHex: '#3b82f6' },
  { slug: 'older-people', name: 'Older People', colorHex: '#64748b' },
  { slug: 'neighbourhoods', name: 'Neighbourhoods', colorHex: '#14b8a6' },
  { slug: 'disability', name: 'Disability', colorHex: '#8b5cf6' },
  { slug: 'poverty-reduction', name: 'Poverty Reduction', colorHex: '#e11d48' },
  { slug: 'funding-commissioning', name: 'Funding & Commissioning', colorHex: '#0891b2' },
  { slug: 'clean-water-sanitation', name: 'Clean Water & Sanitation', colorHex: '#06b6d4' },
  { slug: 'renewable-energy', name: 'Renewable Energy', colorHex: '#84cc16' },
  { slug: 'economic-development', name: 'Economic Development', colorHex: '#d97706' },
  { slug: 'infrastructure', name: 'Infrastructure', colorHex: '#6b7280' },
  { slug: 'urban-planning', name: 'Urban Planning', colorHex: '#0d9488' },
  { slug: 'agriculture', name: 'Agriculture', colorHex: '#65a30d' },
  { slug: 'biodiversity', name: 'Biodiversity', colorHex: '#16a34a' },
  { slug: 'technology', name: 'Technology', colorHex: '#2563eb' },
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5' },
  { slug: 'human-rights', name: 'Human Rights', colorHex: '#dc2626' },
  { slug: 'criminal-justice', name: 'Criminal Justice', colorHex: '#7c3aed' },
  { slug: 'philanthropy', name: 'Philanthropy', colorHex: '#0369a1' },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12' },
  { slug: 'ai', name: 'AI', colorHex: '#1e40af' },
  { slug: 'sustainability', name: 'Sustainability', colorHex: '#059669' },
  { slug: 'food', name: 'Food', colorHex: '#ca8a04' },
  { slug: 'open-infrastructure', name: 'Open Infrastructure', colorHex: '#475569' },
] as const;

export const PURPOSES = [
  { slug: 'strategy', name: 'Strategy' },
  { slug: 'policy-development', name: 'Policy development' },
  { slug: 'practice-service-improvement', name: 'Practice / service improvement' },
  { slug: 'learning-development', name: 'Learning & development' },
  { slug: 'system-change', name: 'System change' },
  { slug: 'research', name: 'Research' },
  { slug: 'funding-decision-making', name: 'Funding decision-making' },
  { slug: 'advocacy', name: 'Advocacy' },
  { slug: 'infrastructure-building', name: 'Infrastructure building' },
] as const;

export const SOURCE_TYPES = [
  { slug: 'evaluation', name: 'Evaluation' },
  { slug: 'learning-report', name: 'Learning report' },
  { slug: 'needs-assessment', name: 'Needs assessment' },
  { slug: 'research-study', name: 'Research study' },
  { slug: 'policy-paper', name: 'Policy paper' },
  { slug: 'strategy-document', name: 'Strategy document' },
  { slug: 'evidence-review', name: 'Evidence review' },
  { slug: 'case-study', name: 'Case study' },
  { slug: 'annual-review', name: 'Annual review' },
  { slug: 'framework', name: 'Framework' },
] as const;

export const TARGET_AUDIENCE_TYPES = [
  { slug: 'government-national', name: 'Government - national' },
  { slug: 'government-devolved', name: 'Government - devolved' },
  { slug: 'government-local', name: 'Government - local' },
  { slug: 'front-line-vcse', name: 'Front line VCSE' },
  { slug: 'public-sector', name: 'Public sector (NHS, schools, etc.)' },
  { slug: 'infrastructure-orgs', name: 'Infrastructure orgs' },
  { slug: 'communities', name: 'Communities' },
  { slug: 'funders', name: 'Funders' },
  { slug: 'commissioning-bodies', name: 'Commissioning bodies' },
  { slug: 'cross-sector-collaboration', name: 'Cross sector collaboration' },
  { slug: 'private-sector', name: 'Private Sector' },
  { slug: 'academia', name: 'Academia' },
  { slug: 'civil-society', name: 'Civil Society' },
  { slug: 'general-public', name: 'General Public' },
] as const;

export const LOCATION_SCOPES = [
  { slug: 'local', name: 'Local' },
  { slug: 'regional', name: 'Regional' },
  { slug: 'national', name: 'National' },
  { slug: 'international', name: 'International' },
  { slug: 'global', name: 'Global' },
] as const;

export const ROLE_RELEVANCES = [
  { slug: 'policy-maker', name: 'Policy Maker' },
  { slug: 'practitioner', name: 'Practitioner' },
  { slug: 'researcher', name: 'Researcher' },
  { slug: 'senior-leader', name: 'Senior Leader' },
  { slug: 'community-leader', name: 'Community Leader' },
  { slug: 'educator', name: 'Educator' },
  { slug: 'advocate', name: 'Advocate' },
  { slug: 'funder', name: 'Funder' },
  { slug: 'commissioner', name: 'Commissioner' },
] as const;

export const PRIORITY_TIMESCALES = [
  { slug: 'short-term', name: 'Short-term' },
  { slug: 'medium-term', name: 'Medium-term' },
  { slug: 'long-term', name: 'Long-term' },
  { slug: 'urgent', name: 'Urgent' },
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
