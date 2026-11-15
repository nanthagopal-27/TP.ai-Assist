import type { WeatherData, WidgetDef } from '../../shared/types';
import { INDIA_STATES } from '../../shared/config';
import { h } from '../dom';
import { rpc } from '../messaging';
import type { WidgetCtx } from './types';

const dayName = (iso: string, i: number) =>
  i === 0 ? 'Today' : new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

/** Weather card: pick a state / place, see current conditions and a short forecast. */
export function buildWeather(def: WidgetDef, ctx: WidgetCtx): HTMLElement {
  const p = (def.props ??= {});
  const locations = p.locations?.length ? p.locations : INDIA_STATES;
  const units = p.units ?? 'c';
  const deg = units === 'f' ? '°F' : '°C';

  const select = h('select', { title: 'Choose a state / place' }, ...locations.map((l) => h('option', { value: l }, l)));
  select.value = p.defaultLocation && locations.includes(p.defaultLocation) ? p.defaultLocation : locations[0];
  const refresh = h('button', { class: 'ibtn', type: 'button', title: 'Refresh' }, '⟳');
  const body = h('div', { class: 'wx-body' });
  const title = h('div', { class: 'lbl' }, p.label || 'Weather');
  const root = h('div', { class: 'cmp wx' }, title, h('div', { class: 'wx-head' }, select, refresh), body);

  let seq = 0;
  async function load(): Promise<void> {
    const mine = ++seq;
    body.replaceChildren(h('div', { class: 'dim' }, 'Loading weather…'));
    try {
      const w = await rpc<WeatherData>({ type: 'ORBIT_WEATHER', location: select.value, units });
      if (mine === seq) render(w);
    } catch (e) {
      if (mine === seq) body.replaceChildren(h('div', { class: 'err' }, e instanceof Error ? e.message : String(e)));
    }
  }

  function render(w: WeatherData): void {
    const c = w.current;
    const stat = (k: string, v: string) => h('div', { class: 'wx-stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
    body.replaceChildren(
      h(
        'div',
        { class: 'wx-now' },
        h('div', { class: 'wx-icon' }, c.icon),
        h('div', {}, h('div', { class: 'wx-temp' }, `${Math.round(c.temp)}${deg}`), h('div', { class: 'wx-sum' }, c.summary)),
      ),
      h('div', { class: 'wx-place' }, w.place),
      h(
        'div',
        { class: 'wx-grid' },
        stat('Feels like', `${Math.round(c.feels_like)}${deg}`),
        stat('Humidity', `${c.humidity}%`),
        stat('Wind', `${Math.round(c.wind)} km/h`),
        stat('Rain now', `${c.precip} mm`),
      ),
      h(
        'div',
        { class: 'wx-days' },
        ...w.daily.slice(0, 4).map((d, i) =>
          h(
            'div',
            { class: 'wx-day', title: d.summary },
            h('div', { class: 'k' }, dayName(d.date, i)),
            h('div', { class: 'wx-dicon' }, d.icon),
            h('div', { class: 'v' }, `${Math.round(d.max)}° / ${Math.round(d.min)}°`),
            h('div', { class: 'k' }, `${d.rain_prob}% rain`),
          ),
        ),
      ),
      h('div', { class: 'meta' }, h('span', {}, `${w.source} · ${new Date(w.fetched_at * 1000).toLocaleTimeString()}`)),
    );
  }

  select.addEventListener('change', () => {
    p.defaultLocation = select.value;
    void ctx.persist();
    void load();
  });
  refresh.addEventListener('click', () => void load());
  void load();
  return root;
}
