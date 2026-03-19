import { useEffect, useState, useCallback, useRef } from 'react';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { GLOBAL_TOUR_STEPS, GUIDED_TOUR_VERSION } from '@/components/onboarding/tourSteps';
import type { ActiveTab } from '@/types/solarzap';

export type TourOrigin = 'auto' | 'manual';
export type TourState = 'idle' | 'welcome' | 'running' | 'closed';

type UseGuidedTourOptions = {
  enabled?: boolean;
  onBeforeStart?: () => void;
  welcomeTitle?: string;
  welcomeDescription?: string;
};

export function useGuidedTour(
  activeTab: ActiveTab,
  onTabChange: (tab: ActiveTab) => void,
  enabledOrOptions: boolean | UseGuidedTourOptions = true
) {
  const options = typeof enabledOrOptions === 'boolean'
    ? { enabled: enabledOrOptions }
    : enabledOrOptions;
  const enabled = options.enabled ?? true;
  const onBeforeStart = options.onBeforeStart;
  const welcomeTitle = options.welcomeTitle ?? 'Bem-vindo ao SolarZap';
  const welcomeDescription = options.welcomeDescription ?? 'Vamos te mostrar rapidamente os principais recursos para voce operar com seguranca desde o primeiro dia.';

  const onboarding = useOnboardingProgress(enabled);
  const [tourState, setTourState] = useState<TourState>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [origin, setOrigin] = useState<TourOrigin>('auto');
  const initializedRef = useRef<boolean>(false);
  const previousProgressIdentityRef = useRef<string | null>(null);

  const progress = onboarding.data;
  const dbVersion = progress?.guided_tour_version;
  const dbStatus = progress?.guided_tour_status || 'never_seen';
  const progressIdentity = progress ? `${progress.user_id}:${progress.org_id ?? 'no-org'}` : null;
  
  const isEligibleForAutoPlay = 
    enabled && 
    progress && 
    (dbVersion !== GUIDED_TOUR_VERSION || dbStatus === 'never_seen');

  const localSupressionKey = progress ? `tour_suppressed_${progress.user_id}_${progress.org_id}` : null;
  const isLocallySuppressed = typeof window !== 'undefined' && localSupressionKey 
    ? sessionStorage.getItem(localSupressionKey) === GUIDED_TOUR_VERSION 
    : false;

  useEffect(() => {
    if (!enabled || !progressIdentity) return;

    if (previousProgressIdentityRef.current === progressIdentity) return;

    previousProgressIdentityRef.current = progressIdentity;
    initializedRef.current = false;
    setTourState('idle');
    setStepIndex(0);
    setOrigin('auto');
  }, [enabled, progressIdentity]);

  useEffect(() => {
    if (!enabled || onboarding.isLoading || !progress || initializedRef.current) return;
    
    if (isEligibleForAutoPlay && !isLocallySuppressed) {
      setOrigin('auto');
      setTourState('welcome');
      initializedRef.current = true;
    } else {
      setTourState('closed');
      initializedRef.current = true;
    }
  }, [enabled, onboarding.isLoading, progress, isEligibleForAutoPlay, isLocallySuppressed]);

  const startTour = useCallback((overrideOrigin?: TourOrigin) => {
    try {
      onBeforeStart?.();
    } catch (err) {
      console.error('Failed to prepare guided tour start', err);
    }

    const nextOrigin = overrideOrigin ?? origin;
    setOrigin(nextOrigin);
    setStepIndex(0);
    setTourState('running');
    if (nextOrigin === 'manual' && overrideOrigin === 'manual' && typeof window !== 'undefined') {
      onboarding.recordGuidedTourManualReplay('start').catch(console.error);
    }
  }, [onboarding, origin, onBeforeStart]);

  const closeTour = useCallback(async (reason: 'skip' | 'close' | 'complete') => {
    setTourState('closed');
    if (localSupressionKey && typeof window !== 'undefined') {
      sessionStorage.setItem(localSupressionKey, GUIDED_TOUR_VERSION);
    }

    const shouldSyncTerminalState =
      origin === 'auto' ||
      dbStatus === 'never_seen' ||
      dbVersion !== GUIDED_TOUR_VERSION;

    if (shouldSyncTerminalState) {
      try {
        if (reason === 'complete') {
          await onboarding.markGuidedTourCompleted(GUIDED_TOUR_VERSION);
        } else {
          await onboarding.markGuidedTourDismissed(GUIDED_TOUR_VERSION);
        }
      } catch (err) {
        console.error('Failed to sync tour state', err);
      }
    }

    if (origin === 'manual' && reason === 'complete') {
      onboarding.recordGuidedTourManualReplay('complete').catch(console.error);
    }
  }, [origin, localSupressionKey, onboarding, dbStatus, dbVersion]);

  const nextStep = useCallback(async () => {
    if (stepIndex + 1 < GLOBAL_TOUR_STEPS.length) {
      const nextIndex = stepIndex + 1;
      const targetStep = GLOBAL_TOUR_STEPS[nextIndex];
      
      if (targetStep.tab !== activeTab) {
        onTabChange(targetStep.tab);
      }
      setStepIndex(nextIndex);
    } else {
      await closeTour('complete');
    }
  }, [stepIndex, activeTab, onTabChange, closeTour]);

  const previousStep = useCallback(() => {
    if (stepIndex > 0) {
      const prevIndex = stepIndex - 1;
      const targetStep = GLOBAL_TOUR_STEPS[prevIndex];
      
      if (targetStep.tab !== activeTab) {
        onTabChange(targetStep.tab);
      }
      setStepIndex(prevIndex);
    }
  }, [stepIndex, activeTab, onTabChange]);

  // Detector Invisivel de Navegação Intuitiva
  useEffect(() => {
    if (tourState === 'running') {
      const currentStep = GLOBAL_TOUR_STEPS[stepIndex];
      if (currentStep && currentStep.tab !== activeTab) {
        // Encontra o proximo passo sequencial da aba nova clicada organicamente
        const indexOfNextTabStep = GLOBAL_TOUR_STEPS.findIndex(
          (s, i) => i > stepIndex && s.tab === activeTab
        );
        if (indexOfNextTabStep !== -1) {
           setStepIndex(indexOfNextTabStep);
        }
      }
    }
  }, [activeTab, stepIndex, tourState]);

  return {
    showWelcome: tourState === 'welcome',
    running: tourState === 'running',
    stepIndex,
    steps: GLOBAL_TOUR_STEPS,
    welcomeTitle,
    welcomeDescription,
    isLoading: onboarding.isLoading,
    origin,
    startTour,
    closeTour,
    nextStep,
    previousStep,
  };
}
