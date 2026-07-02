const ONBOARDING_STORAGE_KEY = "mm-onboarding-completed";

export function isOnboardingCompleted(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
}

export function completeOnboarding(): void {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
}

export function resetOnboarding(): void {
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
