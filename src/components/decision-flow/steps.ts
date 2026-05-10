export type DecisionFlowStep = {
  id: string;
  title: string;
  body: string;
  primaryCta: string;
};

export const DECISION_FLOW_STEPS: ReadonlyArray<DecisionFlowStep> = [
  {
    id: 'welcome',
    title: 'Welcome to open-recs-local',
    body: 'A local-first place to upload reports, extract recommendations, and search across them.',
    primaryCta: 'Next',
  },
  {
    id: 'upload',
    title: 'Upload your first document',
    body: 'Drop a PDF — the worker parses, extracts recommendations, and embeds pages for you.',
    primaryCta: 'Next',
  },
  {
    id: 'search',
    title: 'Search and chat',
    body: 'Hybrid search ranks recommendations across documents. Chat answers from passages with citations.',
    primaryCta: 'Get started',
  },
];
