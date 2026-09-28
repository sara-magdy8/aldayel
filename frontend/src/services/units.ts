import { apiClient } from './api';
import { Unit, UnitType, UnitStatus, ListingType } from '@/types';

// ── Backend raw types ──────────────────────────────────────────────────────

interface UnitImage {
  id: number;
  image_path: string;
  url?: string; // appended by the UnitImage model accessor (asset('storage/...'))
}

interface RawUnit {
  id: number;
  property_id: number;
  unit_number: string;
  unit_type?: UnitType | null;
  activities?: string[];
  activity?: string | null;
  floor?: string | null;
  area?: number | null;
  rooms_count?: number | null;
  price?: number | null;
  listing_type: ListingType;
  status: UnitStatus;
  notes?: string | null;
  description?: string | null;
  conditions?: string | null;
  grace_period?: string | null;
  images: UnitImage[];
  // Public-link fields — not yet on the backend; defaults applied in normaliseUnit.
  public_link_token?: string;
  public_link_enabled?: boolean;
  public_show_price?: boolean;
  public_show_location?: boolean;
  public_show_contact?: boolean;
}

// ── Normaliser ─────────────────────────────────────────────────────────────

function normaliseUnit(raw: RawUnit): Unit {
  return {
    ...raw,
    id: String(raw.id),
    property_id: String(raw.property_id),
    floor: raw.floor ?? undefined,
    area: raw.area ?? undefined,
    rooms_count: raw.rooms_count ?? undefined,
    price: raw.price ?? undefined,
    notes: raw.notes ?? undefined,
    description: raw.description ?? undefined,
    conditions: raw.conditions ?? undefined,
    grace_period: raw.grace_period ?? undefined,
    images: raw.images?.map(img => img.url ?? img.image_path) ?? [],
    // Public-link fields are not yet stored per unit on the backend;
    // use placeholder defaults so the UI renders without errors.
    public_link_token: raw.public_link_token ?? `tok-u-${raw.id}`,
    public_link_enabled: raw.public_link_enabled ?? false,
    public_show_price: raw.public_show_price ?? true,
    public_show_location: raw.public_show_location ?? true,
    public_show_contact: raw.public_show_contact ?? true,
  };
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface UnitFormData {
  unit_number: string;
  /** Activity names attached to the unit; replaces the old unit type field. */
  activities?: string[];
  floor?: string;
  area?: number;
  rooms_count?: number;
  price?: number;
  listing_type: ListingType;
  status: UnitStatus;
  notes?: string;
  /** المواصفات. Sent as '' rather than omitted so clearing it persists. */
  description?: string;
  /** الشروط. Sent as '' rather than omitted so clearing it persists. */
  conditions?: string;
  /** فترة السماح — only meaningful when listing_type is 'إيجار'. */
  grace_period?: string;
}

export interface BulkCreateData {
  property_id: string | number;
  count: number;
  /** Activity names applied to every unit in the batch. */
  activities?: string[];
  listing_type: ListingType;
  floor?: string;
  price?: number;
}

/**
 * Copy form fields onto a FormData body. Arrays are sent as repeated `key[]`
 * entries so PHP parses them back into an array — String(value) would flatten
 * `activities` into one comma-joined string.
 */
function appendFields(fd: FormData, data: Partial<UnitFormData>): void {
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      // An empty array still has to be sent, otherwise the backend cannot tell
      // "cleared all activities" from "field not submitted".
      if (value.length === 0) fd.append(`${key}[]`, '');
      else value.forEach(v => fd.append(`${key}[]`, String(v)));
      return;
    }
    fd.append(key, String(value));
  });
}

/** A persisted unit image, carrying the id needed to delete it. */
export interface UnitImageDto {
  id: string;
  url: string;
}

// ── Service ────────────────────────────────────────────────────────────────

export const unitsService = {
  /** GET /api/properties/{property}/units */
  async list(propertyId: string): Promise<Unit[]> {
    const raw = await apiClient.get<RawUnit[]>(`/properties/${propertyId}/units`);
    return raw.map(normaliseUnit);
  },

  /**
   * POST /api/properties/{property}/units
   * When images are supplied, the request is sent as multipart/form-data so the
   * backend (UnitController::store) can store each file and persist its path.
   */
  async create(propertyId: string, data: UnitFormData, images: File[] = []): Promise<Unit> {
    if (images.length === 0) {
      const raw = await apiClient.post<RawUnit>(`/properties/${propertyId}/units`, data);
      return normaliseUnit(raw);
    }

    const fd = new FormData();
    appendFields(fd, data);
    images.forEach(img => fd.append('images[]', img));

    const raw = await apiClient.postForm<RawUnit>(`/properties/${propertyId}/units`, fd);
    return normaliseUnit(raw);
  },

  /** GET /api/units/{unit} */
  async show(unitId: string): Promise<Unit> {
    const raw = await apiClient.get<RawUnit>(`/units/${unitId}`);
    return normaliseUnit(raw);
  },

  /**
   * PUT /api/units/{unit}
   * When images are supplied, the request is sent as multipart POST with a
   * spoofed `_method=PUT` field — PHP only parses multipart bodies on POST, so a
   * real PUT would arrive with empty files. Newly uploaded images are appended.
   */
  async update(unitId: string, data: Partial<UnitFormData>, images: File[] = []): Promise<Unit> {
    if (images.length === 0) {
      const raw = await apiClient.put<RawUnit>(`/units/${unitId}`, data);
      return normaliseUnit(raw);
    }

    const fd = new FormData();
    fd.append('_method', 'PUT');
    appendFields(fd, data);
    images.forEach(img => fd.append('images[]', img));

    const raw = await apiClient.postForm<RawUnit>(`/units/${unitId}`, fd);
    return normaliseUnit(raw);
  },

  /** GET /api/units/{unit} → existing images with the ids needed for deletion. */
  async getImages(unitId: string): Promise<UnitImageDto[]> {
    const raw = await apiClient.get<RawUnit>(`/units/${unitId}`);
    return (raw.images ?? []).map(img => ({
      id: String(img.id),
      url: img.url ?? img.image_path,
    }));
  },

  /** DELETE /api/units/{unit}/images/{image} */
  deleteImage(unitId: string, imageId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/units/${unitId}/images/${imageId}`);
  },

  /** POST /api/units/{unit}/toggle-link → flips public_link_enabled. */
  toggleLink(unitId: string): Promise<{ public_link_enabled: boolean }> {
    return apiClient.post<{ public_link_enabled: boolean }>(`/units/${unitId}/toggle-link`, {});
  },

  /** POST /api/units/{unit}/link-settings → persists the public_show_* flags. */
  linkSettings(
    unitId: string,
    settings: { public_show_price?: boolean; public_show_location?: boolean; public_show_contact?: boolean },
  ): Promise<Unit> {
    return apiClient.post<RawUnit>(`/units/${unitId}/link-settings`, settings).then(normaliseUnit);
  },

  /** DELETE /api/units/{unit} */
  remove(unitId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/units/${unitId}`);
  },

  /** POST /api/units/bulk */
  async bulkCreate(data: BulkCreateData): Promise<{ created: number; units: Unit[] }> {
    const raw = await apiClient.post<{ created: number; units: RawUnit[] }>('/units/bulk', {
      ...data,
      property_id: Number(data.property_id),
    });
    return { created: raw.created, units: raw.units.map(normaliseUnit) };
  },
};
