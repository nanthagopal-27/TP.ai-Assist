/** parseCopilotResponse: pulls clean text out of a matched Direct Line bot activity.
 * Priority: activity.value.response (Generative Answers/Search) over activity.text (structured
 * topics), then strips markdown links/emphasis and citation anchors like [1], [2]. */
import type { DirectLineActivity } from "./client";

const CITATION_RE = /\s*\[\d+\]/g;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const MD_EMPHASIS_RE = /(\*\*|\*|__|_)/g;
const WHITESPACE_RE = /[ \t]+/g;

export function parseCopilotResponse(activity: DirectLineActivity): string {
  const value = activity.value;
  let text: string | undefined =
    value && typeof value === "object" && "response" in (value as Record<string, unknown>)
      ? ((value as Record<string, unknown>).response as string | undefined)
      : undefined;
  if (!text) text = activity.text;
  text = (text ?? "").trim();

  text = text.replace(MD_LINK_RE, "$1");
  text = text.replace(CITATION_RE, "");
  text = text.replace(MD_EMPHASIS_RE, "");
  text = text.replace(WHITESPACE_RE, " ");
  return text.trim();
}
