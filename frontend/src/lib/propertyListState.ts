import { PropertySort, SoumFilter } from '@/services/properties';

/**
 * A snapshot of the properties list (page + filters), handed to the units page
 * as router state and handed straight back by its "العودة لعقارات…" button, so
 * the user returns to the exact page and filters they left — not page 1.
 */
export interface PropertyListState {
  page: number;
  perPage: number;
  search: string;
  status: string[];
  category: string[];
  type: string[];
  activity: string[];
  /** حالة البناء — عقارات البيع only, so the rental list never sets it. */
  buildingStatus?: string[];
  governorate: string[];
  area: string[];
  /** المالك — selected client id, and its name so the trigger keeps its label. */
  owner?: string;
  ownerName?: string;
  minArea: string;
  maxArea: string;
  /** السوم — عقارات البيع only, so the rental list never sets it. */
  soum?: SoumFilter;
  sort: PropertySort;
}

/**
 * Read a snapshot off `location.state`. Anything else (a direct visit, a
 * refresh, an old link) reads as "no snapshot" and the list opens fresh.
 */
export const readPropertyListState = (state: unknown): PropertyListState | null =>
  state && typeof state === 'object' && 'page' in state ? (state as PropertyListState) : null;
