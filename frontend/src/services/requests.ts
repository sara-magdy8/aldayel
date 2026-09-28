import { apiClient } from './api';
import { appendArrayParam, appendMatchOptions, MatchOptions } from '@/lib/query';
import { ClientRequest, RequestStatus, RequestType, RequestCategory } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RequestFilters {
  search?:       string;
  status?:       string[];
  request_type?: string[];
  activity_id?:  string[];
  governorate_id?: string[];
  area_id?:        string[];
  min_area?:     number;
  max_area?:     number;
  page?:         number;
  /** Page size; backend default is 20 and it caps the value at 500. */
  per_page?:     number;
}

export interface PaginatedRequests {
  data:         ClientRequest[];
  current_page: number;
  last_page:    number;
  per_page:     number;
  total:        number;
}

export type RequestFormPayload = {
  client_id:    string;
  request_type: RequestType;
  category:     RequestCategory;
  /** النشاط — activity names (many-to-many). Empty array clears them. */
  activities?:  string[];
  governorate_id?: number;
  /** المنطقة — area ids (many-to-many). Empty array clears them. */
  area_ids?:       number[];
  area?:        number;
  /** السعر — client budget in KWD. */
  price?:       number;
  /** الوسيط — client id (type 'وسيط'), or null to clear the link. */
  broker_id?:   string | null;
  notes?:       string;
  status?:      RequestStatus;
};

// Raw shape returned by the API (nested client object)
interface ApiPropertyRequest {
  id:           number;
  client_id:    number;
  request_type: string;
  category:     string;
  activities?:  string[] | null;
  activity?:    string | null;
  governorate_id?: number | null;
  area_ids?:       number[] | null;
  governorate?:    string | null;
  area_names?:     string[] | null;
  // The area names joined by the backend, for the one-cell المنطقة display.
  area_name?:      string | null;
  area?:        number | null;
  price?:       number | string | null;
  broker_id?:   number | null;
  // Resolved by the backend from the linked client (read-only).
  broker_name?:      string | null;
  broker_phone_num?: string | null;
  notes?:       string;
  status:       string;
  created_at:   string;
  client: {
    id:        number;
    full_name: string;
    phone:     string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQuery(filters: RequestFilters): string {
  const params = new URLSearchParams();
  if (filters.search)                                               params.set('search',       filters.search);
  appendArrayParam(params, 'status',         filters.status);
  appendArrayParam(params, 'request_type',   filters.request_type);
  appendArrayParam(params, 'activity_id',    filters.activity_id);
  appendArrayParam(params, 'governorate_id', filters.governorate_id);
  appendArrayParam(params, 'area_id',        filters.area_id);
  if (filters.min_area     != null)                                params.set('min_area',     String(filters.min_area));
  if (filters.max_area     != null)                                params.set('max_area',     String(filters.max_area));
  if (filters.page         && filters.page         > 1)            params.set('page',         String(filters.page));
  if (filters.per_page     != null)                                params.set('per_page',     String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Map raw API response to the flat ClientRequest shape expected by the UI. */
function normaliseRequest(raw: ApiPropertyRequest): ClientRequest {
  return {
    id:           String(raw.id),
    client_id:    String(raw.client_id),
    client_name:  raw.client?.full_name ?? '',
    client_phone: raw.client?.phone     ?? '',
    request_type: raw.request_type as RequestType,
    category:     raw.category     as RequestCategory,
    activities:   raw.activities ?? [],
    activity:     raw.activity ?? undefined,
    governorate_id: raw.governorate_id ?? undefined,
    area_ids:       raw.area_ids ?? [],
    governorate:    raw.governorate ?? undefined,
    area_names:     raw.area_names ?? [],
    area_name:      raw.area_name ?? undefined,
    area:         raw.area ?? undefined,
    // MySQL returns DECIMAL as a string ("1500.000") — coerce so the form input
    // and the currency display both get a real number.
    price:        raw.price != null ? Number(raw.price) : undefined,
    broker_id:        raw.broker_id != null ? String(raw.broker_id) : undefined,
    broker_name:      raw.broker_name ?? undefined,
    broker_phone_num: raw.broker_phone_num ?? undefined,
    notes:        raw.notes,
    status:       raw.status     as RequestStatus,
    created_at:   raw.created_at ? raw.created_at.split('T')[0] : '',
  };
}

// ── Service ────────────────────────────────────────────────────────────────

export const requestsService = {
  async list(filters: RequestFilters = {}): Promise<PaginatedRequests> {
    const raw = await apiClient.get<{
      data:         ApiPropertyRequest[];
      current_page: number;
      last_page:    number;
      per_page:     number;
      total:        number;
    }>(`/requests${buildQuery(filters)}`);
    return { ...raw, data: raw.data.map(normaliseRequest) };
  },

  async create(payload: RequestFormPayload): Promise<ClientRequest> {
    const raw = await apiClient.post<ApiPropertyRequest>('/requests', payload);
    return normaliseRequest(raw);
  },

  async update(id: string, payload: Partial<RequestFormPayload>): Promise<ClientRequest> {
    const raw = await apiClient.put<ApiPropertyRequest>(`/requests/${id}`, payload);
    return normaliseRequest(raw);
  },

  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/requests/${id}`);
  },

  /**
   * Client requests that match a given property (same listing type, category,
   * activity, and area, and not completed). GET /properties/{id}/matching-requests
   *
   * `options` carries the معايير مطابقة اضافية: size and price are matched exactly
   * unless the matching flag is set, which widens that field to a ± percentage band.
   */
  async matchingForProperty(propertyId: string, options: MatchOptions = {}): Promise<ClientRequest[]> {
    const params = new URLSearchParams();
    appendMatchOptions(params, options);
    const qs = params.toString();
    const raw = await apiClient.get<ApiPropertyRequest[]>(`/properties/${propertyId}/matching-requests${qs ? `?${qs}` : ''}`);
    return raw.map(normaliseRequest);
  },
};
