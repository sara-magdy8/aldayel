import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a YYYY-MM-DD date (the shape services normalise to) for display as
 * DD-MM-YYYY. Returns the input unchanged if it isn't in the expected shape.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}

/**
 * Format an ISO timestamp as "Y-m-d H:i:s" in local time.
 * Returns `fallback` for empty values, or the raw string if it can't be parsed.
 */
export function formatDateTime(value: string | null | undefined, fallback = '-'): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
