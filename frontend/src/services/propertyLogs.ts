import { apiClient } from './api';

/** One سجل العقار entry, as returned by GET /properties/{id}/logs. */
export interface PropertyLog {
  id: number;
  /** Machine key, e.g. `rental_contract_created` — drives the icon/colour. */
  action: string;
  /** Ready-to-show Arabic sentence. */
  description: string;
  /** For edits: {label: [old, new]} — either side may be null (empty). */
  changes: Record<string, [string | null, string | null]> | null;
  /** Set when the entry concerns one unit of a multi-unit property. */
  unit_number: string | null;
  /** Null for changes made by the system (payment callback, automatic status). */
  user_name: string | null;
  created_at: string;
}

export const propertyLogsService = {
  /** Newest first; the backend caps it at the latest 500 entries. */
  list(propertyId: string): Promise<PropertyLog[]> {
    return apiClient.get<PropertyLog[]>(`/properties/${propertyId}/logs`);
  },
};
