import type { AIRequestPayload, AIResponse, IdRecord, WidgetDef } from '../../shared/types';
import { h } from '../dom';
import { rpc } from '../messaging';
import { collectPage } from '../page';
import type { Mounted } from './types';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unspecified';
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'unspecified'];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low / done', unspecified: 'Reference',
};

function toSeverity(raw: string): Severity {
  const s = raw.trim().toLowerCase();
  return (SEVERITIES as string[]).includes(s) ? (s as Severity) : 'unspecified';
}

/** Buckets ids by what kind of record they are (from the AI's short `kind` label), so the list
 *  reads as a dashboard - Cases / Orders / Tracking / SOPs - instead of one long shelf. */
type GroupName = 'Cases' | 'Orders' | 'Tracking' | 'SOPs' | 'Reference';
const GROUP_ORDER: GroupName[] = ['Cases', 'Orders', 'Tracking', 'SOPs', 'Reference'];
function groupOf(kind: string): GroupName {
  const k = kind.toLowerCase();
  if (k.includes('case')) return 'Cases';
  if (k.includes('order')) return 'Orders';
  if (k.includes('track')) return 'Tracking';
  if (k.includes('sop')) return 'SOPs';
  return 'Reference';
}
/** The short word worth showing next to the id inside its chip - the kind label with its generic
 *  "... number" suffix stripped (e.g. "replacement order number" -> "replacement"); '' when
 *  nothing is left over (a plain case/SOP number doesn't need a second tag). */
function shortTag(kind: string): string {
  return kind.replace(/\s*(order|tracking|case|sop)?\s*number\s*$/i, '').trim();
}
const GROUP_SINGULAR: Record<GroupName, string> = {
  Cases: 'Case', Orders: 'Order', Tracking: 'Tracking', SOPs: 'SOP', Reference: 'Reference',
};

async function copyText(text: string, btn: HTMLElement): Promise<void> {
  const prev = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Copy failed';
  }
  setTimeout(() => (btn.textContent = prev), 1300);
}

/** "Get IDs" widget: one button, placed on the page like any other widget (drag-and-drop from
 *  the toolbar or side panel), that pulls case/order/ticket/SOP-style IDs straight off the
 *  current page - no selection, no setup. Results are grouped by kind and colour-coded by
 *  priority; a filter narrows them by priority (re-filtering the already-fetched list, not
 *  asking the AI again). Click any chip to copy its id; hover it for the important details
 *  (date, status, a one-line summary). */
export function buildIds(def: WidgetDef, m: Mounted): HTMLElement {
  let items: IdRecord[] = [];
  let filter: 'all' | Severity = 'all';
  let hideTimer = 0;
  let progressTimer = 0;
  let updatedAt: number | null = null;

  // Label and trigger are two separate elements in a space-between row, not one big pill - so
  // widening the card just stretches the gap between them; the "Scan" button itself never grows
  // and always stays docked to the right, the same way the Priority filter does.
  const label = h('span', { class: 'idrun-label' }, h('span', { class: 'idtag' }, '#'), def.label || 'Get IDs on this page');
  const btnSpin = h('span', { class: 'idspinner' });
  btnSpin.style.display = 'none';
  const btnText = h('span', {}, 'Scan');
  const btn = h('button', { class: 'idscan', type: 'button' }, btnSpin, btnText);
  const runRow = h('div', { class: 'idrunrow' }, label, btn);

  const progressFill = h('div', { class: 'idprogress-fill' });
  const progress = h(
    'div',
    { class: 'idprogress-wrap' },
    h('div', { class: 'idprogress' }, progressFill),
    h('div', { class: 'idprogress-sub' }, 'Reading tickets and notes'),
    h(
      'div',
      { class: 'idskeleton' },
      ...Array.from({ length: 6 }, () => h('div', { class: 'idskel-block' })),
    ),
  );
  progress.style.display = 'none';

  const list = h(
    'div',
    { class: 'idempty' },
    h('div', { class: 'idempty-ico' }, '🔍'),
    h('div', { class: 'idempty-title' }, 'No IDs yet'),
    h('div', { class: 'idempty-sub' }, 'Click scan to pull case, order, tracking and SOP numbers from this page.'),
  );
  m.out = list;

  const filterSel = h(
    'select',
    { class: 'idfilter', title: 'Filter by priority' },
    h('option', { value: 'all' }, 'All'),
  ) as HTMLSelectElement;
  filterSel.addEventListener('change', () => {
    filter = filterSel.value as 'all' | Severity;
    renderList();
  });

  /** Only the priorities actually present in the last scan's results - a page with just
   *  reference-type ids shouldn't offer a "Critical" option that would always come back empty. */
  function presentSeverities(): Severity[] {
    return SEVERITIES.filter((s) => items.some((it) => toSeverity(it.severity) === s));
  }

  function rebuildFilterOptions(): void {
    const present = presentSeverities();
    filterSel.replaceChildren(
      h('option', { value: 'all' }, 'All'),
      ...present.map((s) => h('option', { value: s }, SEVERITY_LABEL[s])),
    );
    if (filter !== 'all' && !present.includes(filter as Severity)) filter = 'all';
    filterSel.value = filter;
  }

  // ---- hover card: just the important details, built once and repositioned/refilled per chip.
  const tipArrow = h('div', { class: 'idtip-arrow' });
  const tipHead = h('div', { class: 'idtip-head' });
  const tipTags = h('div', { class: 'idtip-tags' });
  const tipSum = h('p', { class: 'idtip-sum' });
  const tipCopy = h('button', { class: 'idtip-copy', type: 'button' }, '📋 Copy ID');
  const tipFoot = h('div', { class: 'idtip-foot' }, tipCopy, h('span', { class: 'idtip-key' }, h('kbd', {}, 'C'), 'to copy'));
  const tip = h('div', { class: 'idtip' }, tipArrow, tipHead, tipTags, tipSum, tipFoot);
  tip.style.display = 'none';
  const cancelHide = () => window.clearTimeout(hideTimer);
  const hideNow = () => {
    tip.style.display = 'none';
    window.removeEventListener('keydown', onTipKey, true);
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer = window.setTimeout(hideNow, 150);
  };
  let activeId = '';
  function onTipKey(e: KeyboardEvent): void {
    if (e.key.toLowerCase() === 'c' && activeId) void copyText(activeId, tipCopy);
  }
  tip.addEventListener('mouseenter', cancelHide);
  tip.addEventListener('mouseleave', scheduleHide);

  function showTip(chip: HTMLElement, it: IdRecord): void {
    cancelHide();
    const sev = toSeverity(it.severity);
    activeId = it.id;
    tip.className = `idtip sev-${sev}`;
    const headKids = [
      h('span', { class: 'idtip-id' }, it.id),
      it.status.trim() ? h('span', { class: 'idtip-status' }, h('span', { class: 'iddot' }), it.status) : null,
    ].filter((n): n is HTMLElement => n !== null);
    tipHead.replaceChildren(...headKids);
    const tagKids = [
      h('span', { class: `idtip-tag sev-${sev}` }, h('span', { class: 'iddot' }), SEVERITY_LABEL[sev]),
      h('span', { class: 'idtip-tag' }, GROUP_SINGULAR[groupOf(it.kind)]),
      it.date.trim() ? h('span', { class: 'idtip-tag' }, '🕐 ', it.date) : null,
    ].filter((n): n is HTMLElement => n !== null);
    tipTags.replaceChildren(...tagKids);
    tipSum.textContent = it.summary.trim() || 'No extra context found for this id.';
    tipCopy.textContent = '📋 Copy ID';
    tipCopy.onclick = () => void copyText(it.id, tipCopy);
    window.removeEventListener('keydown', onTipKey, true);
    window.addEventListener('keydown', onTipKey, true);
    const r = chip.getBoundingClientRect();
    const width = 280;
    const top = Math.min(r.bottom + 10, window.innerHeight - 180);
    const left = Math.min(Math.max(r.left, 8), window.innerWidth - width - 8);
    tip.style.cssText = `display:block;position:fixed;top:${top}px;left:${left}px;width:${width}px;`;
    tipArrow.style.left = `${Math.min(Math.max(r.left + r.width / 2 - left, 14), width - 14)}px`;
  }

  function buildChip(it: IdRecord): HTMLElement {
    const sev = toSeverity(it.severity);
    const tag = shortTag(it.kind);
    const chip = h(
      'span',
      { class: `idchip sev-${sev}`, title: 'Click to copy' },
      h('span', { class: 'iddot' }),
      h('span', { class: 'idchip-id' }, it.id),
      tag ? h('span', { class: 'idchip-tag' }, tag) : null,
    );
    chip.addEventListener('click', () => {
      void navigator.clipboard.writeText(it.id).catch(() => undefined);
      chip.classList.add('copied');
      window.setTimeout(() => chip.classList.remove('copied'), 900);
    });
    chip.addEventListener('mouseenter', () => showTip(chip, it));
    chip.addEventListener('mouseleave', scheduleHide);
    return chip;
  }

  function renderList(): void {
    if (!items.length) return; // empty-state placeholder stays as-is
    const shown = filter === 'all' ? items : items.filter((it) => toSeverity(it.severity) === filter);
    if (!shown.length) {
      list.replaceChildren(h('p', { class: 'dim' }, `No ${SEVERITY_LABEL[filter as Severity]?.toLowerCase() ?? ''} ids found.`));
      return;
    }
    const copyAll = h('button', { class: 'mini', type: 'button' }, 'Copy all');
    copyAll.addEventListener('click', () => void copyText(shown.map((it) => it.id).join('\n'), copyAll));

    const groups = new Map<GroupName, IdRecord[]>();
    for (const it of shown) {
      const g = groupOf(it.kind);
      const arr = groups.get(g) ?? [];
      arr.push(it);
      groups.set(g, arr);
    }

    const legend = h(
      'div',
      { class: 'idlegend' },
      ...presentSeverities().map((s) => h('span', { class: 'idlegend-item' }, h('span', { class: `iddot sev-${s}` }), SEVERITY_LABEL[s])),
    );

    const groupEls = GROUP_ORDER.filter((g) => groups.has(g)).map((g) => {
      const its = groups.get(g)!;
      return h(
        'div',
        { class: 'idgroup' },
        h('div', { class: 'idgroup-head' }, g.toUpperCase(), h('span', { class: 'idgroup-count' }, String(its.length))),
        h('div', { class: 'idchips' }, ...its.map(buildChip)),
      );
    });

    const updated = updatedAt ? 'Updated just now' : '';
    list.replaceChildren(
      h(
        'div',
        { class: 'idcount' },
        h('span', {}, `${shown.length} of ${items.length} ID${items.length === 1 ? '' : 's'}`),
        copyAll,
      ),
      legend,
      ...groupEls,
      h(
        'div',
        { class: 'idfoot' },
        h('span', {}, 'Click any ID to copy'),
        h('span', {}, updated),
      ),
    );
  }

  function startProgress(): void {
    window.clearInterval(progressTimer);
    progressFill.style.width = '6%';
    let pct = 6;
    progressTimer = window.setInterval(() => {
      pct = Math.min(pct + (90 - pct) * 0.18, 90);
      progressFill.style.width = `${pct}%`;
    }, 220);
  }
  function stopProgress(): void {
    window.clearInterval(progressTimer);
    progressFill.style.width = '100%';
  }

  async function run(): Promise<void> {
    btn.setAttribute('disabled', '');
    btn.classList.add('loading');
    btnSpin.style.display = '';
    btnText.textContent = 'Working';
    list.style.display = 'none';
    progress.style.display = 'grid';
    hideNow();
    startProgress();
    try {
      const page = collectPage();
      const payload: AIRequestPayload = {
        action: 'extract_ids',
        scope: 'page',
        page: { url: page.url, title: page.title, description: page.description, text: page.text },
      };
      const res = await rpc<AIResponse>({ type: 'ORBIT_RUN_ACTION', payload });
      items = res.result.ids;
      filter = 'all';
      rebuildFilterOptions();
      updatedAt = Date.now();
      if (!items.length) {
        list.replaceChildren(h('p', { class: 'dim' }, res.result.content || 'No IDs found on this page.'));
      } else {
        renderList();
      }
    } catch (e) {
      items = [];
      rebuildFilterOptions();
      list.replaceChildren(h('p', { class: 'err' }, e instanceof Error ? e.message : String(e)));
    } finally {
      stopProgress();
      window.setTimeout(() => {
        progress.style.display = 'none';
        list.style.display = '';
      }, 180);
      btn.removeAttribute('disabled');
      btn.classList.remove('loading');
      btnSpin.style.display = 'none';
      btnText.textContent = 'Rescan';
    }
  }

  btn.addEventListener('click', () => void run());

  // The filter lives in the body, not the header: the hover toolbar (Move/Edit/Remove) is
  // absolutely positioned over the widget's top-right corner, which would otherwise sit right on
  // top of a header-placed control and make it unreachable while hovering.
  const header = h('div', { class: def.mode === 'float' ? 'hd drag' : 'hd' }, h('span', { class: 'hd-sub' }, 'ID extractor'));
  const filterRow = h('div', { class: 'idfilterrow' }, h('span', { class: 'hd-sub' }, 'Priority'), filterSel);
  const bodyEl = h('div', { class: 'bd' }, filterRow, runRow, progress, list, tip);
  m.body = bodyEl;
  const card = h('div', { class: 'card' }, header, bodyEl);
  (card as HTMLElement & { dragHandle?: HTMLElement }).dragHandle = header;
  return card;
}
