import type { WidgetDef } from '../../shared/types';

/** A widget that is currently attached to the page. */
export interface Mounted {
  def: WidgetDef;
  host: HTMLElement;
  /** AI card pieces */
  body?: HTMLElement;
  out?: HTMLElement;
  inlineOut?: HTMLElement;
  fill?: (text: string) => void;
  /** Ancestors whose min-height was pinned to make room for this widget (see
   *  freezeShrinkableAncestors in widgets.ts) - released, reference-counted, on unmount. */
  frozenAncestors?: Element[];
}

/** What the engine offers to the individual component builders (avoids circular imports). */
export interface WidgetCtx {
  persist: () => Promise<void>;
  /** output areas of "AI Output" widgets that are on the page right now */
  outputs: () => HTMLElement[];
  /** fill functions of the "AI Input" widgets that are on the page right now */
  inputs: () => ((text: string) => void)[];
}
