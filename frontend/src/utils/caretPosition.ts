/**
 * Computes the on-screen pixel position of a caret index inside a
 * <textarea> or single-line <input>, so an overlay (e.g. inline "ghost
 * text") can be positioned to line up with the real cursor — including on
 * wrapped multi-line textarea text.
 *
 * Technique: an off-screen mirror <div> is given the same font/box
 * metrics as the real element, filled with the text up to `position`,
 * and a marker <span> is appended at that exact point. The marker's
 * offsetTop/offsetLeft then correspond to the caret's position within
 * the element's own content box. For an <input> the mirror uses
 * `white-space: pre` (no wrap, matching how a real single-line input
 * scrolls horizontally instead of wrapping) rather than `pre-wrap`.
 */

const MIRRORED_PROPERTIES: (keyof CSSStyleDeclaration)[] = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
  'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
  'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize',
];

let mirrorDiv: HTMLDivElement | null = null;

function getMirrorDiv(): HTMLDivElement {
  if (!mirrorDiv) {
    mirrorDiv = document.createElement('div');
    mirrorDiv.style.position = 'absolute';
    mirrorDiv.style.visibility = 'hidden';
    mirrorDiv.style.top = '0';
    mirrorDiv.style.left = '-9999px';
    document.body.appendChild(mirrorDiv);
  }
  return mirrorDiv;
}

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(
  el: HTMLTextAreaElement | HTMLInputElement,
  position: number
): CaretCoordinates {
  const div = getMirrorDiv();
  const computed = window.getComputedStyle(el);
  const isTextarea = el.tagName === 'TEXTAREA';

  for (const prop of MIRRORED_PROPERTIES) {
    (div.style as any)[prop] = computed[prop] as string;
  }
  div.style.width = computed.width;
  // A real <textarea> wraps; a real <input> scrolls horizontally instead —
  // the mirror must match, or caret x/y would diverge on long text.
  div.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre';
  div.style.overflowWrap = isTextarea ? 'break-word' : 'normal';

  div.textContent = el.value.substring(0, position);

  const marker = document.createElement('span');
  marker.textContent = el.value.substring(position) || '.';
  div.appendChild(marker);

  const rect = el.getBoundingClientRect();
  const coordinates: CaretCoordinates = {
    top: rect.top + marker.offsetTop - el.scrollTop,
    left: rect.left + marker.offsetLeft - el.scrollLeft,
    height: marker.offsetHeight || parseInt(computed.lineHeight || '16', 10),
  };

  div.removeChild(marker);

  return coordinates;
}
