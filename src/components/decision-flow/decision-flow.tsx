'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{step.title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleSkip} aria-label="Skip onboarding">
          Skip
        </Button>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          <motion.p
            key={step.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-muted-foreground"
          >
            {step.body}
          </motion.p>
        </AnimatePresence>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack} disabled={index === 0}>
            Back
          </Button>
          <span className="text-xs text-muted-foreground">
            {index + 1} / {total}
          </span>
          <Button onClick={handleNext}>{step.primaryCta}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
