/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {customElement} from 'lit/decorators.js';

import {Checkbox} from './lib/checkbox.js';
import {styles} from './lib/checkbox-styles.css.js';
import {styles as forcedColorsStyles} from './lib/forced-colors-styles.css.js';

declare global {
  interface HTMLElementTagNameMap {
    'md-checkbox': MdCheckbox;
  }
}

/**
 * @summary Checkboxes allow users to select one or more items from a set.
 * Checkboxes can turn an option on or off.
 *
 * @description
 * Use checkboxes to:
 * - Select one or more options from a list
 * - Present a list containing sub-selections
 * - Turn an item on or off in a desktop environment
 *
 * @final
 * @suppress {visibility}
 */
@customElement('md-checkbox')
export class MdCheckbox extends Checkbox {
  static override styles = [styles, forcedColorsStyles];
}
