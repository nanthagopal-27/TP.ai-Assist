// Types shared by the content script, service worker and side panel.

// The AI request/response contract (used by background/copilot.ts and the AI widgets).
export type ActionId = 'summarize' | 'translate' | 'explain' | 'extract' | 'extract_ids' | 'person' | 'company' | 'ask';
export type Scope = 'auto' | 'selection' | 'page';

export interface PageInfo {
  url: string;
  title: string;
  description: string;
  text: string;
}

export interface AIRequestPayload {
  action: ActionId;
  prompt?: string;
  scope: Scope;
  selected_text?: string;
  page?: PageInfo;
  target_language?: string;
}

export interface KeyValue {
  label: string;
  value: string;
}

export interface IdRecord {
  id: string;
  kind: string;
  severity: string;
  date: string;
  status: string;
  summary: string;
}

export interface AIResult {
  title: string;
  content: string;
  bullets: string[];
  fields: KeyValue[];
  ids: IdRecord[];
}

export interface AIResponse {
  request_id: string;
  action: ActionId;
  model: string;
  latency_ms: number;
  mock: boolean;
  result: AIResult;
}

export interface PageContext {
  url: string;
  title: string;
  description: string;
  lang: string;
  headings: string[];
  text: string;
  selection: string;
  collectedAt: number;
}

export interface HistoryItem {
  request_id: string;
  created_at: number;
  action: ActionId;
  page_url: string | null;
  page_title: string | null;
  input_chars: number;
  status: 'ok' | 'error';
  error: string | null;
  model: string | null;
  latency_ms: number | null;
}

/** Result of GET_CONTEXT: what the side panel knows about the active tab. */
export interface ActiveTabContext {
  tabId: number | null;
  url: string;
  title: string;
  /** true when the page cannot be read (chrome://, Web Store, PDF viewer, ...) */
  restricted: boolean;
  context: PageContext | null;
}

// ---------------------------------------------------------------------------
// In-page widgets (PixieBrix-style component builder)
// ---------------------------------------------------------------------------
/** 'input' / 'output' / 'both' are the AI boxes (kept under their original names for saved widgets). */
export type WidgetKind =
  | 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'radio'
  | 'button' | 'weather' | 'form' | 'ocr' | 'action' | 'ids'
  | 'input' | 'output' | 'both';
export type FieldType = 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'radio';
export type WidgetMode = 'inline' | 'float';
export type InsertPosition = 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';

/** Properties shared by every form-control component. */
export interface FieldProps {
  label?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  helpText?: string;
  minLen?: number;
  maxLen?: number;
  pattern?: string;
  /** dropdown / radio options */
  options?: string[];
}

export interface FormField extends FieldProps {
  id: string;
  type: FieldType;
  label: string;
  name: string;
}

export interface WidgetProps extends FieldProps {
  // weather
  locations?: string[];
  defaultLocation?: string;
  units?: 'c' | 'f';
  // form
  title?: string;
  fields?: FormField[];
  submitLabel?: string;
  successMessage?: string;
  continueUrl?: string;
  // ocr
  ocrEngine?: 'local' | 'ai';
  // action button (e.g. "Escalate": asks for an e-mail address, then sends a templated e-mail)
  variant?: 'dark' | 'outline' | 'red';
  askRecipient?: boolean;
  recipient?: string;
  subject?: string;
  body?: string;
  askNote?: boolean;
  /** Inline placement only: whether to try joining a horizontal row with whatever widget is
   *  already right next to the drop spot ('row', the default when unset) or always stack as a
   *  normal vertical block regardless ('column'). See insertWidgetHost in content/widgets.ts. */
  layout?: 'row' | 'column';
}

export interface WidgetDef {
  id: string;
  kind: WidgetKind;
  mode: WidgetMode;
  /** inline widgets: where in the page DOM they live */
  anchor?: { selector: string; position: InsertPosition; tag: string };
  /** floating widgets: fixed viewport position in px */
  float?: { x: number; y: number };
  props?: WidgetProps;
  /** button widget */
  label?: string;
  url?: string;
  newTab?: boolean;
  /** AI input widget (remembered choices) */
  action?: ActionId;
  language?: string;
  replaceOnPage?: boolean;
  /** answer language of non-translate AI actions ('' = same as the text) */
  outLang?: string;
  /** user-resized size in px (drag the corner handle) */
  w?: number;
  h?: number;
  createdAt: number;
}

export interface WidgetInfo extends WidgetDef {
  mounted: boolean;
}

export interface WidgetPatch {
  props?: WidgetProps;
  label?: string;
  url?: string;
  newTab?: boolean;
}

export interface WidgetPlaceRequest extends WidgetPatch {
  kind: WidgetKind;
  mode: WidgetMode;
}

export interface ReplaceResult {
  ok: boolean;
  message: string;
}

export interface WeatherData {
  location: string;
  place: string;
  units: 'c' | 'f';
  current: { temp: number; feels_like: number; humidity: number; wind: number; precip: number; code: number; summary: string; icon: string };
  daily: { date: string; max: number; min: number; rain_prob: number; code: number; summary: string; icon: string }[];
  source: string;
  fetched_at: number;
}

export interface SubmissionItem {
  id: number;
  created_at: number;
  form_title: string;
  widget_id: string;
  page_url: string;
  page_title: string;
  data: Record<string, string>;
}

export type ExtMessage =
  // background -> content
  | { type: 'ORBIT_COLLECT_PAGE' }
  // content -> background
  | { type: 'ORBIT_SELECTION_CHANGED'; text: string }
  | { type: 'ORBIT_OPEN_PANEL' }
  | { type: 'ORBIT_WIDGET_EDIT_REQUEST'; id: string }
  // side panel -> background (forwarded to the active tab's content script)
  | { type: 'ORBIT_WIDGET_PLACE'; request: WidgetPlaceRequest }
  | { type: 'ORBIT_WIDGET_CANCEL' }
  | { type: 'ORBIT_WIDGET_LIST' }
  | { type: 'ORBIT_WIDGET_REMOVE'; id?: string }
  | { type: 'ORBIT_WIDGET_UPDATE'; id: string; patch: WidgetPatch }
  | { type: 'ORBIT_WIDGET_MOVE'; id: string }
  // Arms/disarms the page's native-drag acceptor ahead of an actual OS-level drag crossing in
  // from the side panel - needed because Chrome strips the custom drag MIME type that would
  // otherwise identify "this drag is ours" by the time dragenter reaches the page.
  | { type: 'ORBIT_WIDGET_DRAG_ARM'; kind: WidgetKind }
  | { type: 'ORBIT_WIDGET_DRAG_DISARM' }
  | { type: 'ORBIT_REPLACE_SELECTION'; text: string }
  | { type: 'ORBIT_UNDO_REPLACE' }
  // side panel -> background
  | { type: 'ORBIT_GET_CONTEXT' }
  | { type: 'ORBIT_RUN_ACTION'; payload: AIRequestPayload }
  | { type: 'ORBIT_WEATHER'; location: string; units: 'c' | 'f' }
  | { type: 'ORBIT_CAPTURE_TAB' }
  | { type: 'ORBIT_OCR'; image: string; engine: 'local' | 'ai' }
  | { type: 'ORBIT_OFFSCREEN_OCR'; image: string }
  | { type: 'ORBIT_COPILOT_HEALTH' }
  // broadcasts to the side panel
  | { type: 'ORBIT_SELECTION_UPDATE'; tabId: number; text: string }
  | { type: 'ORBIT_TAB_CHANGED'; tabId: number }
  | { type: 'ORBIT_WIDGET_EVENT'; event: 'placed' | 'cancelled' | 'removed' | 'changed' | 'failed' | 'edit'; message?: string; id?: string };

export type BgResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OcrResult {
  text: string;
  engine: string;
  confidence?: number;
}

export interface EmailResult {
  ok: boolean;
  mode: 'smtp' | 'mock';
  id: number;
  message: string;
}
