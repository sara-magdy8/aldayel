import { apiClient } from './api';

/** نوع السوم — mirrors the tinyint the backend stores (0=>مباشر, 1=>غير مباشر). */
export type SoumType = 'مباشر' | 'غير مباشر';

/** The only type that carries broker data. */
export const SOUM_TYPE_INDIRECT: SoumType = 'غير مباشر';

export const SOUM_TYPES: SoumType[] = ['مباشر', SOUM_TYPE_INDIRECT];

// ── Backend raw shape ──────────────────────────────────────────────────────

interface RawSoum {
  id: number;
  property_id: number;
  bidder_name: string;
  /** `date` cast — arrives as a full ISO timestamp, not YYYY-MM-DD. */
  soum_date: string;
  /** `decimal:3` cast — Laravel hands this back as a string. */
  amount: string | number;
  soum_type: SoumType;
  broker_name: string | null;
  broker_phone: string | null;
}

// ── Normalised shape ───────────────────────────────────────────────────────

export interface Soum {
  id: string;
  property_id: string;
  bidder_name: string;
  /** YYYY-MM-DD, ready for an `<input type="date">`. */
  soum_date: string;
  amount: number;
  soum_type: SoumType;
  /** Filled for غير مباشر bids only. */
  broker_name?: string;
  broker_phone?: string;
}

function normalise(raw: RawSoum): Soum {
  return {
    id: String(raw.id),
    property_id: String(raw.property_id),
    bidder_name: raw.bidder_name,
    soum_date: raw.soum_date ? raw.soum_date.slice(0, 10) : '',
    amount: Number(raw.amount),
    soum_type: raw.soum_type,
    broker_name: raw.broker_name ?? undefined,
    broker_phone: raw.broker_phone ?? undefined,
  };
}

// ── DTO ────────────────────────────────────────────────────────────────────

export interface SoumFormData {
  bidder_name: string;
  soum_date: string;
  amount: number;
  soum_type: SoumType;
  /** Required by the backend when soum_type is غير مباشر, ignored otherwise. */
  broker_name?: string;
  broker_phone?: string;
}

// ── Service ────────────────────────────────────────────────────────────────

export const soumsService = {
  /** GET /api/properties/{property}/soums — newest first. */
  async list(propertyId: string): Promise<Soum[]> {
    const raw = await apiClient.get<RawSoum[]>(`/properties/${propertyId}/soums`);
    return raw.map(normalise);
  },

  /** POST /api/properties/{property}/soums */
  async create(propertyId: string, data: SoumFormData): Promise<Soum> {
    const raw = await apiClient.post<RawSoum>(`/properties/${propertyId}/soums`, data);
    return normalise(raw);
  },

  /** PUT /api/soums/{soum} — the form submits every field, so this is a full replace. */
  async update(soumId: string, data: SoumFormData): Promise<Soum> {
    const raw = await apiClient.put<RawSoum>(`/soums/${soumId}`, data);
    return normalise(raw);
  },

  /** DELETE /api/soums/{soum} — a real delete; the row is gone. */
  remove(soumId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/soums/${soumId}`);
  },
};
