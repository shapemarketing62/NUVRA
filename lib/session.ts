export const BUSINESS_ID_KEY = "nuvra_business_id";
export const DEMO_MODE_KEY = "nuvra_demo_mode";

export function getStoredBusinessId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BUSINESS_ID_KEY);
}

export function setStoredBusinessId(id: string) {
  localStorage.setItem(BUSINESS_ID_KEY, id);
  localStorage.removeItem(DEMO_MODE_KEY);
}

export function setDemoMode() {
  localStorage.setItem(DEMO_MODE_KEY, "1");
  localStorage.removeItem(BUSINESS_ID_KEY);
}

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_MODE_KEY) === "1";
}
