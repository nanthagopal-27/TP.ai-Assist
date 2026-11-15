/** AI request/response types shared between the Chrome extension (extension/) and the backend
 * (backend/). This is the API contract between them - kept in exactly one place so the two
 * sides can never drift out of sync; edit here, both pick it up. Pure type declarations only
 * (no runtime code), so each side just imports it with a relative path - no build step, no
 * published package needed. */

export type ActionId = "summarize" | "translate" | "explain" | "extract" | "extract_ids" | "person" | "company" | "ask";
export type Scope = "auto" | "selection" | "page";

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
