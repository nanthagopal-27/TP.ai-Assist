import "dotenv/config";

const bool = (v: string | undefined, def = false): boolean => {
  if (v === undefined) return def;
  return ["1", "true", "yes"].includes(v.trim().toLowerCase());
};

export const PRODUCT_NAME = (process.env.PRODUCT_NAME ?? "Orbit PixieBrix").trim();
export const MOCK_MODE = bool(process.env.MOCK_MODE, false);
export const MAX_CONTEXT_CHARS = parseInt(process.env.MAX_CONTEXT_CHARS ?? "30000", 10);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const PORT = parseInt(process.env.PORT ?? "8000", 10);
export const MAX_EMAILS_PER_HOUR = parseInt(process.env.MAX_EMAILS_PER_HOUR ?? "30", 10);
export const MAX_EMAILS_PER_RECIPIENT_HOUR = parseInt(process.env.MAX_EMAILS_PER_RECIPIENT_HOUR ?? "5", 10);
