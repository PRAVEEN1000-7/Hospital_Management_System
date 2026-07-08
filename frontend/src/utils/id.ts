// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost).
// A production site served over plain HTTP — or an older browser — throws
// "crypto.randomUUID is not a function" the instant this runs, which crashes
// the whole component (blank page) since these ids are generated in initial
// state / render, not inside a try/catch.
export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
