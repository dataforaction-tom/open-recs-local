'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { DECISION_FLOW_STEPS } from './steps';

export const DECISION_FLOW_SEEN_KEY = 'decision-flow:seen';

export function DecisionFlow() {
  const [seen, setSeen] = useLocalStorage<boolean>(DECISION_FLOW_SEEN_KEY, false);
  const [index, setIndex] = useState(0);

  if (seen) return null;

  const total = DECISION_FLOW_STEPS.length;
  const step = DECISION_FLOW_STEPS[index];
  if (!step) return null;
  const isLast = index === total - 1;

  const handleNext = () => {
    if (isLast) {
      setSeen(true);
      return;
    }
    setIndex((i) => Math.min(i + 1, total - 1));
  };

  const handleBack = () => setIndex((i) => Math.max(i - 1, 0));
  const handleSkip = () => setSeen(true);

  return (
    <section className="mb-8 border border-rule-strong bg-accent-soft/40 p-6">
      <header className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="eyebrow text-accent">
            Step {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
          </div>
          <h2 className="text-lg font-medium tracking-tight">{step.title}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSkip} aria-label="Skip onboarding">
          Skip
        </Button>
      </header>
      <AnimatePresence mode="wait">
        <motion.p
          key={step.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="mt-4 font-serif text-base text-foreground"
        >
          {step.body}
        </motion.p>
      </AnimatePresence>
      <div className="mt-6 flex items-center justify-between border-t border-rule pt-4">
        <Button variant="ghost" onClick={handleBack} disabled={index === 0}>
          Back
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {String(index + 1).padStart(2, '0')} · {String(total).padStart(2, '0')}
        </span>
        <Button onClick={handleNext}>{step.primaryCta}</Button>
      </div>
    </section>
  );
}
