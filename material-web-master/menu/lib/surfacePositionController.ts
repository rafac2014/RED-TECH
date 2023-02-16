/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ReactiveController, ReactiveControllerHost} from 'lit';
import {StyleInfo} from 'lit/directives/style-map.js';

/**
 * A corner of a box in the standard logical property style of <block>_<inline>
 */
export type Corner = 'END_START'|'END_END'|'START_START'|'START_END';

/**
 * The configurable options for the surface position controller.
 */
export interface SurfacePositionControllerProperties {
  /**
   * The corner of the anchor to align the surface's position.
   */
  anchorCorner: Corner;
  /**
   * The corner of the surface to align to the given anchor corner.
   */
  surfaceCorner: Corner;
  /**
   * The HTMLElement reference of the surface to be positioned.
   */
  surfaceEl: HTMLElement|null;
  /**
   * The HTMLElement reference of the anchor to align to.
   */
  anchorEl: HTMLElement|null;
  /**
   * Whether or not the calculation should be relative to the top layer rather
   * than relative to the parent of the anchor.
   *
   * Examples for `isTopLayer:true`:
   *
   * - If there is no `position:relative` in the given parent tree and the
   *   surface is `position:absolute`
   * - If the surface is `position:fixed`
   * - If the surface is in the "top layer"
   * - The anchor and the surface do not share a common `position:relative`
   *   ancestor
   */
  isTopLayer: boolean;
  /**
   * Whether or not the surface should be "open" and visible
   */
  isOpen: boolean;
  /**
   * The number of pixels in which to offset from the inline axis relative to
   * logical property.
   *
   * Positive is right in LTR and left in RTL.
   */
  xOffset: number;
  /**
   * The number of pixes in which to offset the block axis.
   *
   * Positive is down and negative is up.
   */
  yOffset: number;
  /**
   * A function to call after the surface has been positioned.
   */
  onOpen: () => void;
  /**
   * A function to call before the surface should be closed. (A good time to
   * perform animations while the surface is still visible)
   */
  beforeClose: () => Promise<void>;
  /**
   * A function to call after the surface has been closed.
   */
  onClose: () => void;
}

/**
 * Given a surface, an anchor, corners, and some options, this surface will
 * calculate the position of a surface to align the two given corners and keep
 * the surface inside the window viewport. It also provides a StyleInfo map that
 * can be applied to the surface to handle visiblility and position.
 */
export class SurfacePositionController implements ReactiveController {
  // The current styles to apply to the surface.
  private surfaceStylesInternal: StyleInfo = {
    'display': 'none',
  };
  // Previous values stored for change detection. Open change detection is
  // calculated separately so initialize it here.
  private lastValues: SurfacePositionControllerProperties = {isOpen: false} as
      SurfacePositionControllerProperties;

  /**
   * @param host The host to connect the controller to.
   * @param getProperties A function that returns the properties for the
   * controller.
   */
  constructor(
      private readonly host: ReactiveControllerHost,
      private readonly getProperties: () => SurfacePositionControllerProperties,
  ) {
    this.host.addController(this);
  }

  /**
   * The StyleInfo map to apply to the surface via Lit's stylemap
   */
  get surfaceStyles() {
    return this.surfaceStylesInternal;
  }

  /**
   * Calculates the surface's new position required so that the surface's
   * `surfaceCorner` aligns to the anchor's `anchorCorner` while keeping the
   * surface inside the window viewport. This positioning also respects RTL by
   * checking `getComputedStyle()` on the surface element.
   */
  async position() {
    const {
      surfaceEl,
      anchorEl,
      anchorCorner: anchorCornerRaw,
      surfaceCorner: surfaceCornerRaw,
      isTopLayer: topLayerRaw,
      xOffset,
      yOffset,
    } = this.getProperties();
    const anchorCorner = anchorCornerRaw.toUpperCase().trim();
    const surfaceCorner = surfaceCornerRaw.toUpperCase().trim();

    if (!surfaceEl || !anchorEl) {
      return;
    }

    // Paint the surface transparently so that we can get the position and the
    // rect info of the surface.
    this.surfaceStylesInternal = {
      'display': 'block',
      'opacity': '0',
    };

    // Wait for it to be visible.
    this.host.requestUpdate();
    await this.host.updateComplete;

    const surfaceRect = surfaceEl.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const [surfaceBlock, surfaceInline] =
        surfaceCorner.split('_') as Array<'START'|'END'>;
    const [anchorBlock, anchorInline] =
        anchorCorner.split('_') as Array<'START'|'END'>;


    // We use number booleans to multiply values rather than `if` / ternary
    // statements because it _heavily_ cuts down on nesting and readability
    const isTopLayer = topLayerRaw ? 1 : 0;
    // LTR depends on the direction of the SURFACE not the anchor.
    const isLTR = getComputedStyle(surfaceEl).direction === 'ltr' ? 1 : 0;
    const isRTL = isLTR ? 0 : 1;
    const isSurfaceInlineStart = surfaceInline === 'START' ? 1 : 0;
    const isSurfaceInlineEnd = surfaceInline === 'END' ? 1 : 0;
    const isSurfaceBlockStart = surfaceBlock === 'START' ? 1 : 0;
    const isSurfaceBlockEnd = surfaceBlock === 'END' ? 1 : 0;
    const isOneInlineEnd = anchorInline !== surfaceInline ? 1 : 0;
    const isOneBlockEnd = anchorBlock !== surfaceBlock ? 1 : 0;

    /*
     * A diagram that helps describe some of the variables used in the following
     * calculations.
     *
     * ┌───── inline/blockTopLayerOffset
     * │       │
     * │     ┌─▼───┐                  Window
     * │    ┌┼─────┴────────────────────────┐
     * │    ││                              │
     * └──► ││  ┌──inline/blockAnchorOffset │
     *      ││  │     │                     │
     *      └┤  │  ┌──▼───┐                 │
     *       │  │ ┌┼──────┤                 │
     *       │  └─►│Anchor│                 │
     *       │    └┴──────┘                 │
     *       │                              │
     *       │     ┌────────────────────────┼────┐
     *       │     │ Surface                │    │
     *       │     │                        │    │
     *       │     │                        │    │
     *       │     │                        │    │
     *       │     │                        │    │
     *       │     │                        │    │
     *       └─────┼────────────────────────┘    ├┐
     *             │ inline/blockOOBCorrection   ││
     *             │                         │   ││
     *             │                         ├──►││
     *             │                         │   ││
     *             └────────────────────────┐▼───┼┘
     *                                      └────┘
     */

    // Whether or not to apply the width of the anchor
    const inlineAnchorOffset = isOneInlineEnd * anchorRect.width + xOffset;
    // The inline position of the anchor relative to window in LTR
    const inlineTopLayerOffsetLTR = isSurfaceInlineStart * anchorRect.left +
        isSurfaceInlineEnd * (window.innerWidth - anchorRect.right);
    // The inline position of the anchor relative to window in RTL
    const inlineTopLayerOffsetRTL =
        isSurfaceInlineStart * (window.innerWidth - anchorRect.right) +
        isSurfaceInlineEnd * anchorRect.left;
    // The inline position of the anchor relative to window
    const inlineTopLayerOffset =
        isLTR * inlineTopLayerOffsetLTR + isRTL * inlineTopLayerOffsetRTL;
    // If the surface's inline would be out of bounds of the window, move it
    // back in
    const inlineOutOfBoundsCorrection = Math.min(
        0,
        window.innerWidth - inlineTopLayerOffset - inlineAnchorOffset -
            surfaceRect.width);

    // The inline logical value of the surface
    const inline = isTopLayer * inlineTopLayerOffset + inlineAnchorOffset +
        inlineOutOfBoundsCorrection;

    // Whether or not to apply the height of the anchor
    const blockAnchorOffset = isOneBlockEnd * anchorRect.height + yOffset;
    // The absolute block position of the anchor relative to window
    const blockTopLayerOffset = isSurfaceBlockStart * anchorRect.top +
        isSurfaceBlockEnd * (window.innerHeight - anchorRect.bottom);
    // If the surface's block would be out of bounds of the window, move it back
    // in
    const blockOutOfBoundsCorrection = Math.min(
        0,
        window.innerHeight - blockTopLayerOffset - blockAnchorOffset -
            surfaceRect.height);

    // The block logical value of the surface
    const block = isTopLayer * blockTopLayerOffset + blockAnchorOffset +
        blockOutOfBoundsCorrection;

    const surfaceBlockProperty =
        surfaceBlock === 'START' ? 'inset-block-start' : 'inset-block-end';
    const surfaceInlineProperty =
        surfaceInline === 'START' ? 'inset-inline-start' : 'inset-inline-end';

    this.surfaceStylesInternal = {
      'display': 'block',
      'opacity': '1',
      [surfaceBlockProperty]: `${block}px`,
      [surfaceInlineProperty]: `${inline}px`,
    };

    this.host.requestUpdate();
  }

  hostUpdate() {
    this.onUpdate();
  }

  hostUpdated() {
    this.onUpdate();
  }

  /**
   * Checks whether the properties passed into the controller have changed since
   * the last positioning. If so, it will reposition if the surface is open or
   * close it if the surface should close.
   */
  private async onUpdate() {
    const props = this.getProperties();
    let hasChanged = false;
    for (const [key, value] of Object.entries(props)) {
      // tslint:disable-next-line
      hasChanged = hasChanged || (value !== (this.lastValues as any)[key]);
      if (hasChanged) break;
    }

    const openChanged = this.lastValues.isOpen !== props.isOpen;
    const hasAnchor = !!props.anchorEl;
    const hasSurface = !!props.surfaceEl;

    if (hasChanged && hasAnchor && hasSurface) {
      // Only update isOpen, because if it's closed, we do not want to waste
      // time on a useless reposition calculation. So save the other "dirty"
      // values until next time it opens.
      this.lastValues.isOpen = props.isOpen;

      if (props.isOpen) {
        // We are going to do a reposition, so save the prop values for future
        // dirty checking.
        this.lastValues = props;

        await this.position();
        props.onOpen();
      } else if (openChanged) {
        await props.beforeClose();
        this.close();
        props.onClose();
      }
    }
  }

  /**
   * Hides the surface.
   */
  private close() {
    this.surfaceStylesInternal = {
      'display': 'none',
    };
    this.host.requestUpdate();
  }
}
