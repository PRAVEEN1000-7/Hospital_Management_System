import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGhostTextSuggestion } from '../../hooks/useGhostTextSuggestion';
import { getCaretCoordinates, type CaretCoordinates } from '../../utils/caretPosition';

type FieldElement = HTMLTextAreaElement | HTMLInputElement;

// React intercepts the native `value` setter to implement controlled inputs,
// so `el.value = x` alone won't make React notice a change. Going through
// the real prototype setter, then dispatching a genuine 'input' event, makes
// React produce a proper onChange call with a real event object — far more
// robust than hand-constructing a fake SyntheticEvent.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;

function setNativeValue(el: FieldElement, value: string): void {
  const setter = el instanceof HTMLTextAreaElement ? nativeTextareaValueSetter : nativeInputValueSetter;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

interface AutocompleteFieldProps {
  /** Which native element to render. */
  as: 'input' | 'textarea';
  /** ngram field_type key — see backend ngram_service.VALID_FIELD_TYPES. */
  field: string;
  value: string | undefined;
  onChange: (e: React.ChangeEvent<FieldElement>) => void;
  name?: string;
  className?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}

/**
 * Statistical (n-gram) "ghost text" autocomplete, Gmail/Copilot-style: a
 * grey suggested continuation appears right after the caret once typing
 * pauses, accepted with Tab, dismissed with Escape or by moving the caret.
 * Self-contained per instance — each usage owns its own ref/suggestion
 * state, so multiple instances on one page (or inside a list/array) never
 * interfere with each other.
 */
const AutocompleteField: React.FC<AutocompleteFieldProps> = ({
  as,
  field,
  value,
  onChange,
  name,
  className,
  placeholder,
  rows,
  required,
  disabled,
  readOnly,
}) => {
  const elementRef = useRef<FieldElement>(null);
  const [ghostTextPos, setGhostTextPos] = useState<CaretCoordinates | null>(null);
  const safeValue = value ?? '';

  const { suggestion, dismiss } = useGhostTextSuggestion(safeValue, elementRef, field, !disabled && !readOnly);

  useEffect(() => {
    if (!suggestion || !elementRef.current) {
      setGhostTextPos(null);
      return;
    }
    const reposition = () => {
      const el = elementRef.current;
      if (!el) return;
      setGhostTextPos(getCaretCoordinates(el, el.value.length));
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [suggestion]);

  const handleSelect = (e: React.SyntheticEvent<FieldElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd || el.selectionStart !== el.value.length) {
      dismiss();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<FieldElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault(); // only when a suggestion is showing — otherwise Tab moves focus as normal
      setNativeValue(e.currentTarget, safeValue + suggestion);
      dismiss();
    } else if (e.key === 'Escape' && suggestion) {
      e.preventDefault();
      dismiss();
    }
  };

  const overlay = suggestion && ghostTextPos &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          top: ghostTextPos.top,
          left: ghostTextPos.left,
          height: ghostTextPos.height,
          lineHeight: `${ghostTextPos.height}px`,
        }}
        className="pointer-events-none text-slate-400 whitespace-pre z-10"
      >
        {suggestion}
      </div>,
      document.body
    );

  const sharedProps = {
    value,
    onChange,
    onSelect: handleSelect,
    onKeyDown: handleKeyDown,
    name,
    className,
    placeholder,
    required,
    disabled,
    readOnly,
  };

  return (
    <>
      {as === 'textarea' ? (
        <textarea ref={elementRef as React.RefObject<HTMLTextAreaElement>} rows={rows} {...sharedProps} />
      ) : (
        <input ref={elementRef as React.RefObject<HTMLInputElement>} type="text" {...sharedProps} />
      )}
      {overlay}
    </>
  );
};

export default AutocompleteField;
