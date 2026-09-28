import { apiClient } from './api';

/**
 * Flat, already-gated shape returned by GET /api/public/view/{token}
 * (PublicViewController). Price/address/contact are null when the owner
 * chose not to expose them, so the page just renders whatever is present.
 */
export interface PublicView {
  type: 'property' | 'unit';
  name?: string;          // property
  unit_number?: string;   // unit
  unit_type?: string;     // unit
  property_type?: string; // property
  category?: string;
  activity?: string | null;
  listing_type?: string | null; // بيع (sale) | إيجار (rental) — sent for both properties and units
  conditions?: string | null;
  grace_period?: string | number | null;
  floor?: string | number | null;
  status?: string | null;
  area?: string | number | null;
  rooms_count?: number | null;
  description?: string | null;
  price?: number | null;
  address?: string | null;
  location_link?: string | null;
  contact?: string | null;
  // NOTE: مسؤول العقار / الوسيط (manager_*/broker_*) are internal contacts and
  // are not part of this payload — the endpoint deliberately omits them.
  instagram_link?: string | null; // property only — marketing post
  images: string[];
}

export const publicViewService = {
  /** GET /api/public/view/{token} — public, no auth required. */
  get(token: string): Promise<PublicView> {
    return apiClient.get<PublicView>(`/public/view/${token}`);
  },
};
