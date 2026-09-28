/**
 * Append a repeated array query parameter (`key[]=a&key[]=b`) that Laravel
 * parses back into an array under `key`. Blank/undefined entries are skipped;
 * an empty or missing list appends nothing (meaning "no filter").
 */
export function appendArrayParam(
  params: URLSearchParams,
  key: string,
  values?: string[],
): void {
  (values ?? []).forEach((v) => {
    if (v !== undefined && v !== null && v !== '') params.append(`${key}[]`, v);
  });
}

/**
 * معايير مطابقة اضافية shared by both matching lookups (request→properties and
 * property→requests). Each flag widens that field from an exact match to a ±
 * band of the given percentage (0–100); leaving a flag off keeps the exact
 * comparison for that field, and a margin of 0 is equivalent to exact.
 */
export interface MatchOptions {
  /** أقرب مساحة */
  nearest_area?: boolean;
  /** هامش فرق المساحة المسموح, as a percentage */
  area_margin?: number;
  /** أقرب سعر */
  nearest_price?: boolean;
  /** هامش فرق السعر المسموح, as a percentage */
  price_margin?: number;
}

/** Serialise MatchOptions onto a query string; unticked criteria append nothing. */
export function appendMatchOptions(params: URLSearchParams, options: MatchOptions = {}): void {
  if (options.nearest_area) {
    params.set('nearest_area', '1');
    params.set('area_margin', String(options.area_margin ?? 0));
  }
  if (options.nearest_price) {
    params.set('nearest_price', '1');
    params.set('price_margin', String(options.price_margin ?? 0));
  }
}
