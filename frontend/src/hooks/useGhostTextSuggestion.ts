import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import suggestionService from '../services/suggestionService';

const DEBOUNCE_MS = 250;

/**
 * Gmail/Copilot-style inline suggestion for a <textarea> or <input>: after a
 * pause in typing, if the caret is still at the very end of the text with no
 * selection, fetches a statistical (n-gram) continuation from the backend for
 * the given `field` (see backend ngram_service.VALID_FIELD_TYPES). Caller
 * renders `suggestion` as grey text after the caret and calls `dismiss()` on
 * Escape or whenever the caret moves away from the end.
 */
export function useGhostTextSuggestion(
  value: string,
  elementRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  field: string,
  enabled: boolean
) {
  const [suggestion, setSuggestion] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() => {
    abortRef.current?.abort();
    setSuggestion('');
  }, []);

  useEffect(() => {
    if (!enabled || !value) {
      setSuggestion('');
      return;
    }

    const timer = setTimeout(() => {
      const el = elementRef.current;
      if (!el) return;

      const atEndNoSelection =
        el.selectionStart === el.selectionEnd && el.selectionStart === value.length;
      if (!atEndNoSelection) {
        setSuggestion('');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      suggestionService
        .getSuggestion(field, value, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) setSuggestion(result);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestion('');
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, enabled, field, elementRef]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { suggestion, dismiss };
}
