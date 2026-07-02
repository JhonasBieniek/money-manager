import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { completeOnboarding, isOnboardingCompleted } from "../lib/onboarding";

type OnboardingContextValue = {
  showOnboarding: boolean;
  dismissOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !isOnboardingCompleted(),
  );

  const dismissOnboarding = useCallback(() => {
    completeOnboarding();
    setShowOnboarding(false);
  }, []);

  const value = useMemo(
    () => ({ showOnboarding, dismissOnboarding }),
    [showOnboarding, dismissOnboarding],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
