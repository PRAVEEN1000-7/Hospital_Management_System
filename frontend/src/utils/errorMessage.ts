/**
 * Safely extract a displayable string from an Axios error, for toast.error()
 * and friends (which require a string — passing them a raw object crashes
 * the toast's <p> render with "Objects are not valid as a React child").
 *
 * FastAPI/Pydantic v2 returns `detail` as a plain string for a hand-raised
 * HTTPException, but as an ARRAY of {type, loc, msg, ...} objects for a 422
 * validation error — that array shape is what was slipping through raw.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const loc = Array.isArray((item as { loc?: unknown }).loc)
            ? (item as { loc: unknown[] }).loc.filter((p) => p !== 'body').join('.')
            : undefined;
          const msg = String((item as { msg: unknown }).msg);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return typeof item === 'string' ? item : null;
      })
      .filter((m): m is string => Boolean(m));
    if (messages.length) return messages.join('; ');
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}
