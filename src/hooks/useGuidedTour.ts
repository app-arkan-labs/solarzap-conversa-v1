import { useEffect, useMemo, useState } from 'react';
import type { ActiveTab } from '@/types/solarzap';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { TAB_TOUR_STEPS, TOUR_TABS } from '@/components/onboarding/tourSteps';

export function useGuidedTour(activeTab: ActiveTab, enabled = true) {
  const onboarding = useOnboardingProgress(enabled);
  const [showWelcome, setShowWelcome] = useState(false);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const isTourTab = useMemo(() => TOUR_TABS.includes(activeTab), [activeTab]);
  const completedTabs = onboarding.data?.tour_completed_tabs || [];
  const steps = useMemo(() => TAB_TOUR_STEPS[activeTab] || [], [activeTab]);
  const tabAlreadyCompleted = completedTabs.includes(activeTab);

  useEffect(() => {
    if (!enabled) return;
    if (!isTourTab) {
      setShowWelcome(false);
      setRunning(false);
      return;
    }

    if (!onboarding.isLoading && !tabAlreadyCompleted) {
      setShowWelcome(true);
      setRunning(false);
      setStepIndex(0);
    } else {
      setShowWelcome(false);
      setRunning(false);
    }
  }, [activeTab, enabled, isTourTab, onboarding.isLoading, tabAlreadyCompleted]);

  const startTour = () => {
    setShowWelcome(false);
    setStepIndex(0);
    setRunning(true);
  };

  const closeTour = async (markCompleted = true) => {
    setRunning(false);
    setShowWelcome(false);
    if (markCompleted && isTourTab && !tabAlreadyCompleted) {
      await onboarding.markTourTabCompleted(activeTab);
    }
  };

  const nextStep = async () => {
    if (stepIndex + 1 < steps.length) {
      setStepIndex((prev) => prev + 1);
      return;
    }
    await closeTour(true);
  };

  const previousStep = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  return {
    showWelcome,
    running,
    stepIndex,
    steps,
    isLoading: onboarding.isLoading,
    startTour,
    closeTour,
    nextStep,
    previousStep,
  };
}
