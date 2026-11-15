import type { PageContext } from '../shared/types';
import { getSelectedText } from './selection';

const MAX_PAGE_CHARS = 30_000;

/** Readable text + metadata of the current page. */
export function collectPage(): PageContext {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="description"], meta[property="og:description"]');
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3'))
    .slice(0, 40)
    .map((el) => el.innerText.trim())
    .filter(Boolean);

  const main = document.querySelector<HTMLElement>('main, article, [role="main"]');
  let text = main?.innerText ?? '';
  if (text.trim().length < 500) text = document.body?.innerText ?? '';
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_PAGE_CHARS);

  return {
    url: location.href,
    title: document.title,
    description: meta?.content?.trim() ?? '',
    lang: document.documentElement.lang || navigator.language,
    headings,
    text,
    selection: getSelectedText().slice(0, 20_000),
    collectedAt: Date.now(),
  };
}
