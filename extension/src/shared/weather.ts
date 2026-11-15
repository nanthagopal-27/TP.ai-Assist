/**
 * Weather fetched straight from Open-Meteo (free, no key) by the extension's service worker.
 * Chrome's own network stack is used, so the company proxy / certificates your browser already trusts just work -
 * no dependency on the Python backend's internet access.
 */
import type { WeatherData } from './types';

// name -> [lat, lon, city]
const INDIA: Record<string, [number, number, string]> = {
  "Andhra Pradesh": [16.5062, 80.6480, "Vijayawada"],
  "Arunachal Pradesh": [27.0844, 93.6053, "Itanagar"],
  "Assam": [26.1445, 91.7362, "Guwahati"],
  "Bihar": [25.5941, 85.1376, "Patna"],
  "Chhattisgarh": [21.2514, 81.6296, "Raipur"],
  "Goa": [15.4909, 73.8278, "Panaji"],
  "Gujarat": [23.2156, 72.6369, "Gandhinagar"],
  "Haryana": [30.7333, 76.7794, "Chandigarh"],
  "Himachal Pradesh": [31.1048, 77.1734, "Shimla"],
  "Jharkhand": [23.3441, 85.3096, "Ranchi"],
  "Karnataka": [12.9716, 77.5946, "Bengaluru"],
  "Kerala": [8.5241, 76.9366, "Thiruvananthapuram"],
  "Madhya Pradesh": [23.2599, 77.4126, "Bhopal"],
  "Maharashtra": [19.0760, 72.8777, "Mumbai"],
  "Manipur": [24.8170, 93.9368, "Imphal"],
  "Meghalaya": [25.5788, 91.8933, "Shillong"],
  "Mizoram": [23.7271, 92.7176, "Aizawl"],
  "Nagaland": [25.6751, 94.1086, "Kohima"],
  "Odisha": [20.2961, 85.8245, "Bhubaneswar"],
  "Punjab": [30.7333, 76.7794, "Chandigarh"],
  "Rajasthan": [26.9124, 75.7873, "Jaipur"],
  "Sikkim": [27.3314, 88.6138, "Gangtok"],
  "Tamil Nadu": [13.0827, 80.2707, "Chennai"],
  "Telangana": [17.3850, 78.4867, "Hyderabad"],
  "Tripura": [23.8315, 91.2868, "Agartala"],
  "Uttar Pradesh": [26.8467, 80.9462, "Lucknow"],
  "Uttarakhand": [30.3165, 78.0322, "Dehradun"],
  "West Bengal": [22.5726, 88.3639, "Kolkata"],
  "Delhi": [28.6139, 77.2090, "New Delhi"],
  "Jammu and Kashmir": [34.0837, 74.7973, "Srinagar"],
  "Ladakh": [34.1526, 77.5771, "Leh"],
  "Puducherry": [11.9416, 79.8083, "Puducherry"],
  "Chandigarh": [30.7333, 76.7794, "Chandigarh"],
  "Andaman and Nicobar Islands": [11.6234, 92.7265, "Port Blair"],
  "Lakshadweep": [10.5626, 72.6369, "Kavaratti"],
  "Dadra and Nagar Haveli and Daman and Diu": [20.3974, 72.8328, "Daman"],
};
const INDIA_LOWER = new Map(Object.entries(INDIA).map(([k, v]) => [k.toLowerCase(), { name: k, v }]));

const WMO: Record<number, [string, string]> = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Heavy drizzle", "🌦️"],
  56: ["Freezing drizzle", "🌧️"],
  57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌧️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"],
  81: ["Rain showers", "🌦️"],
  82: ["Violent rain showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm with hail", "⛈️"],
  99: ["Thunderstorm with hail", "⛈️"],
};
const describe = (code: number): [string, string] => WMO[code] ?? ['Unknown', '🌡️'];

const cache = new Map<string, { at: number; data: WeatherData }>();
const CACHE_MS = 10 * 60 * 1000;

async function getJson(url: string): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Weather service returned HTTP ${r.status}`);
    return (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  } finally {
    clearTimeout(t);
  }
}

export async function fetchWeather(location: string, units: 'c' | 'f'): Promise<WeatherData> {
  const key = `${location.trim().toLowerCase()}|${units}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let lat: number, lon: number, place: string;
  const known = INDIA_LOWER.get(location.trim().toLowerCase());
  if (known) {
    [lat, lon] = known.v;
    place = `${known.v[2]}, ${known.name}`;
  } else {
    const g = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.trim())}&count=1&language=en&format=json`,
    );
    const r = g.results?.[0];
    if (!r) throw new Error(`Could not find a place called '${location}'.`);
    lat = Number(r.latitude);
    lon = Number(r.longitude);
    place = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
  }

  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '4',
    temperature_unit: units === 'f' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: 'kmh',
  });
  const raw = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  const cur = raw.current;
  const d = raw.daily;
  const r1 = (n: unknown) => Math.round(Number(n ?? 0) * 10) / 10;
  const code = Number(cur.weather_code ?? 0);
  const [text, icon] = describe(code);
  const data: WeatherData = {
    location,
    place,
    units,
    current: {
      temp: r1(cur.temperature_2m),
      feels_like: r1(cur.apparent_temperature ?? cur.temperature_2m),
      humidity: Number(cur.relative_humidity_2m ?? 0),
      wind: r1(cur.wind_speed_10m),
      precip: r1(cur.precipitation),
      code,
      summary: text,
      icon,
    },
    daily: (d.time as string[]).map((date, i) => {
      const c = Number(d.weather_code[i] ?? 0);
      const [t, ic] = describe(c);
      return {
        date,
        max: r1(d.temperature_2m_max[i]),
        min: r1(d.temperature_2m_min[i]),
        rain_prob: Number(d.precipitation_probability_max[i] ?? 0),
        code: c,
        summary: t,
        icon: ic,
      };
    }),
    source: 'Open-Meteo',
    fetched_at: Date.now() / 1000,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
