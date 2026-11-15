/** Weather for the Orbit PixieBrix weather widget.
 *
 * Uses Open-Meteo (free, no API key). Indian states / union territories are resolved from a
 * built-in table (capital city coordinates) so only ONE outbound call is needed; any other place
 * name is resolved through Open-Meteo's geocoding API. */

export type Units = "c" | "f";

export interface WeatherCurrent {
  temp: number;
  feels_like: number;
  humidity: number;
  wind: number; // km/h
  precip: number; // mm
  code: number;
  summary: string;
  icon: string;
}

export interface WeatherDay {
  date: string;
  max: number;
  min: number;
  rain_prob: number;
  code: number;
  summary: string;
  icon: string;
}

export interface WeatherData {
  location: string;
  place: string;
  units: Units;
  current: WeatherCurrent;
  daily: WeatherDay[];
  source: string;
  fetched_at: number;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// name -> [lat, lon, city used for the forecast]
const INDIA: Record<string, [number, number, string]> = {
  "Andhra Pradesh": [16.5062, 80.648, "Vijayawada"],
  "Arunachal Pradesh": [27.0844, 93.6053, "Itanagar"],
  Assam: [26.1445, 91.7362, "Guwahati"],
  Bihar: [25.5941, 85.1376, "Patna"],
  Chhattisgarh: [21.2514, 81.6296, "Raipur"],
  Goa: [15.4909, 73.8278, "Panaji"],
  Gujarat: [23.2156, 72.6369, "Gandhinagar"],
  Haryana: [30.7333, 76.7794, "Chandigarh"],
  "Himachal Pradesh": [31.1048, 77.1734, "Shimla"],
  Jharkhand: [23.3441, 85.3096, "Ranchi"],
  Karnataka: [12.9716, 77.5946, "Bengaluru"],
  Kerala: [8.5241, 76.9366, "Thiruvananthapuram"],
  "Madhya Pradesh": [23.2599, 77.4126, "Bhopal"],
  Maharashtra: [19.076, 72.8777, "Mumbai"],
  Manipur: [24.817, 93.9368, "Imphal"],
  Meghalaya: [25.5788, 91.8933, "Shillong"],
  Mizoram: [23.7271, 92.7176, "Aizawl"],
  Nagaland: [25.6751, 94.1086, "Kohima"],
  Odisha: [20.2961, 85.8245, "Bhubaneswar"],
  Punjab: [30.7333, 76.7794, "Chandigarh"],
  Rajasthan: [26.9124, 75.7873, "Jaipur"],
  Sikkim: [27.3314, 88.6138, "Gangtok"],
  "Tamil Nadu": [13.0827, 80.2707, "Chennai"],
  Telangana: [17.385, 78.4867, "Hyderabad"],
  Tripura: [23.8315, 91.2868, "Agartala"],
  "Uttar Pradesh": [26.8467, 80.9462, "Lucknow"],
  Uttarakhand: [30.3165, 78.0322, "Dehradun"],
  "West Bengal": [22.5726, 88.3639, "Kolkata"],
  Delhi: [28.6139, 77.209, "New Delhi"],
  "Jammu and Kashmir": [34.0837, 74.7973, "Srinagar"],
  Ladakh: [34.1526, 77.5771, "Leh"],
  Puducherry: [11.9416, 79.8083, "Puducherry"],
  Chandigarh: [30.7333, 76.7794, "Chandigarh"],
  "Andaman and Nicobar Islands": [11.6234, 92.7265, "Port Blair"],
  Lakshadweep: [10.5626, 72.6369, "Kavaratti"],
  "Dadra and Nagar Haveli and Daman and Diu": [20.3974, 72.8328, "Daman"],
};
const INDIA_LOWER = new Map<string, [string, number, number, string]>(
  Object.entries(INDIA).map(([name, [lat, lon, city]]) => [name.toLowerCase(), [name, lat, lon, city]]),
);

// WMO weather interpretation codes -> [text, emoji]
const WMO: Record<number, [string, string]> = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌦️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌦️"], 82: ["Violent rain showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm with hail", "⛈️"], 99: ["Thunderstorm with hail", "⛈️"],
};

function describe(code: number): [string, string] {
  return WMO[code] ?? ["Unknown", "🌡️"];
}

async function httpGetJson(url: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const full = new URL(url);
  for (const [k, v] of Object.entries(params)) full.searchParams.set(k, String(v));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(full.toString(), { signal: controller.signal });
    if (!resp.ok) throw new HttpError(resp.status, `Weather service returned HTTP ${resp.status}`);
    return (await resp.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; data: WeatherData }>();
const CACHE_MS = 600_000;

async function resolve(
  location: string,
  getJson: typeof httpGetJson,
): Promise<[number, number, string]> {
  const hit = INDIA_LOWER.get(location.trim().toLowerCase());
  if (hit) {
    const [name, lat, lon, city] = hit;
    return [lat, lon, `${city}, ${name}`];
  }
  const data = await getJson("https://geocoding-api.open-meteo.com/v1/search", {
    name: location.trim(),
    count: 1,
    language: "en",
    format: "json",
  });
  const results = (data.results as Record<string, unknown>[] | undefined) ?? [];
  if (!results.length) throw new HttpError(404, `Could not find a place called '${location}'.`);
  const r = results[0];
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return [Number(r.latitude), Number(r.longitude), parts.join(", ")];
}

export async function getWeather(
  location: string,
  units: Units = "c",
  getJson: typeof httpGetJson = httpGetJson,
): Promise<WeatherData> {
  const key = `${location.trim().toLowerCase()}|${units}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const [lat, lon, place] = await resolve(location, getJson);
  const raw = await getJson("https://api.open-meteo.com/v1/forecast", {
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: 4,
    temperature_unit: units === "f" ? "fahrenheit" : "celsius",
    wind_speed_unit: "kmh",
  });

  const data = parseForecast(location, place, units, raw);
  cache.set(key, { at: Date.now(), data });
  return data;
}

function parseForecast(location: string, place: string, units: Units, raw: Record<string, unknown>): WeatherData {
  const cur = raw.current as Record<string, number>;
  const code = Math.trunc(cur.weather_code ?? 0);
  const [text, icon] = describe(code);
  const current: WeatherCurrent = {
    temp: round1(cur.temperature_2m),
    feels_like: round1(cur.apparent_temperature ?? cur.temperature_2m),
    humidity: Math.trunc(cur.relative_humidity_2m ?? 0),
    wind: round1(cur.wind_speed_10m ?? 0),
    precip: round1(cur.precipitation ?? 0),
    code,
    summary: text,
    icon,
  };
  const d = raw.daily as Record<string, (number | string)[]>;
  const days: WeatherDay[] = (d.time as string[]).map((date, i) => {
    const c = Math.trunc(Number(d.weather_code[i]) || 0);
    const [t, ic] = describe(c);
    return {
      date,
      max: round1(Number(d.temperature_2m_max[i])),
      min: round1(Number(d.temperature_2m_min[i])),
      rain_prob: Math.trunc(Number(d.precipitation_probability_max[i]) || 0),
      code: c,
      summary: t,
      icon: ic,
    };
  });
  return { location, place, units, current, daily: days, source: "Open-Meteo", fetched_at: Date.now() / 1000 };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Deterministic fake data for MOCK_MODE (works offline). */
export function mockWeather(location: string, units: Units = "c"): WeatherData {
  const seed = [...location.toLowerCase()].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 18 + (seed % 14);
  const codes = [0, 2, 61, 3];
  let place = location;
  const hit = INDIA_LOWER.get(location.trim().toLowerCase());
  if (hit) place = `${hit[3]}, ${hit[0]}`;

  const conv = (c: number): number => (units === "f" ? round1((c * 9) / 5 + 32) : c);
  const [text, icon] = describe(codes[seed % 4]);
  const days: WeatherDay[] = Array.from({ length: 4 }, (_, i) => {
    const [t, ic] = describe(codes[(seed + i) % 4]);
    return {
      date: `2026-11-${String(5 + i).padStart(2, "0")}`,
      max: conv(base + 3 - i),
      min: conv(base - 6 + i),
      rain_prob: (seed * (i + 3)) % 90,
      code: codes[(seed + i) % 4],
      summary: t,
      icon: ic,
    };
  });
  return {
    location,
    place,
    units,
    current: {
      temp: conv(base),
      feels_like: conv(base + 1),
      humidity: 40 + (seed % 50),
      wind: 6.0 + (seed % 15),
      precip: 0.0,
      code: codes[seed % 4],
      summary: text,
      icon,
    },
    daily: days,
    source: "Mock data",
    fetched_at: Date.now() / 1000,
  };
}
