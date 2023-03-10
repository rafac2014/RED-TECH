/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {isFormAssociated} from './form-associated.js';

// TODO Label activation shim is currently only needed for Safari. Remove it
// when no longer needed, see b/261871554.

/**
 * Returns true if labeling is supported for form associated custom elemeents.
 * Chrome and Firefox currently do and Safari support appears to be in progress,
 * see https://bugs.webkit.org/show_bug.cgi?id=197960.
 */
export const SUPPORTS_FACE_LABEL =
    'labels' in (globalThis?.ElementInternals?.prototype ?? {});

function isCustomElement(element: HTMLElement) {
  return element.localName.match('-');
}

// Elements that can be associated with a <label> element include <button>,
// <input> (except for type="hidden"), <meter>, <output>, <progress>, <select>
// and <textarea>.
const implicitLabelReactive = new Set(
    ['button', 'input', 'meter', 'progress', 'output', 'select', 'textarea']);

function isLabelReactive(element: HTMLElement) {
  return implicitLabelReactive.has(element.localName) ||
      isFormAssociated(element);
}

/**
 * Provides a shim for labeling form associated custom elements via clicks
 * on label elements. Note, this is currently needed only in Safari and
 * support appears to be in progress, see
 * https://bugs.webkit.org/show_bug.cgi?id=197960.
 */
export function shimLabelSupport(root: Document|ShadowRoot) {
  // Listen for clicks on root to find clicks on label elements
  root.addEventListener('click', labelActivationListener);
}

function labelActivationListener(event: Event) {
  // Find label on which user clicked.
  const path = event.composedPath();
  const root = event.currentTarget as ShadowRoot | Document;
  let label: HTMLLabelElement|undefined = undefined;
  for (let i = 0; i < path.length; i++) {
    const target = path[i] as HTMLElement;
    // Not element or not in scope.
    if (target.nodeType !== Node.ELEMENT_NODE ||
        target.getRootNode() !== root) {
      continue;
    }
    // If the click is on a label reactive element, this is not a label click.
    if (isLabelReactive(target)) {
      return;
    }
    if (target.localName === 'label') {
      label = target as HTMLLabelElement;
    }
  }
  if (label === undefined) {
    return;
  }
  // Find associated element to activate.
  const forId = label.getAttribute('for');
  const target = forId ?
      root.getElementById(forId) :
      Array.from(label.querySelectorAll<HTMLElement>('*'))
          .find((el) => isCustomElement(el) && isFormAssociated(el));
  if (target == null) {
    return;
  }
  // Simulate FACE by issuing a click on the associated element.
  const simulatedClick =
      new PointerEvent('click', {composed: true, bubbles: true});
  target.dispatchEvent(simulatedClick);
}
