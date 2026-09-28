import { apiClient } from './api';
import { appendArrayParam, appendMatchOptions, MatchOptions } from '@/lib/query';
import { Property, PropertyType, PropertyStatus, ListingType, PropertyCategory } from '@/types';

// ── Backend raw types ──────────────────────────────────────────────────────

interface RawAttachment {
  id: number;
  file_path: string;
  file_name: string;
  file_type: string;
  url?: string; // appended by the PropertyAttachment model accessor (asset('storage/...'))
}

interface RawOwner {
  id: number;
  full_name: string;
  phone?: string;
}

interface RawProperty {
  id: number;
  name: string;
  property_code: string;
  property_type: PropertyType;
  listing_type: ListingType;
  category: PropertyCategory;
  filmed_by?: string | null;
  is_filmed?: boolean;
  building_status?: string | null;
  priority?: boolean;
  activities?: string[] | null;
  activity?: string | null;
  owner_id: number;
  owner?: RawOwner;
  plot_number: string;
  area?: number | null;
  governorate_id?: number | null;
  area_id?: number | null;
  governorate?: string | null;
  area_name?: string | null;
  address: string;
  location_link?: string | null;
  description?: string | null;
  guard_name?: string | null;
  guard_phone?: string | null;
  broker_id?: number | null;
  manager_id?: number | null;
  // Names/phones are resolved by the backend from the linked client (read-only).
  broker_name?: string | null;
  broker_phone_num?: string | null;
  manager_name?: string | null;
  manager_phone_num?: string | null;
  forsale_link?: string | null;
  instagram_link?: string | null;
  whatsapp_link?: string | null;
  marketing_status?: boolean;
  commission?: number | null;
  notes?: string | null;
  status: PropertyStatus;
  rent_amount?: number | null;
  price?: number | null;
  conditions?: string | null;
  grace_period?: string | null;
  tenant_id?: number | null;
  tenant_name?: string | null;
  tenant_start?: string | null;
  tenant_end?: string | null;
  sale_date?: string | null;
  attachments: RawAttachment[];
  public_link_token?: string | null;
  public_link_enabled: boolean;
  public_show_price: boolean;
  public_show_location: boolean;
  public_show_contact: boolean;
  /** withCount('soums') on the list endpoint; absent elsewhere. */
  soums_count?: number;
  /** hasOne-of-many: the highest bid. `amount` is a decimal cast, so a string. */
  top_soum?: { amount: string | number; soum_date: string } | null;
  created_at: string;
}

// ── Normaliser ─────────────────────────────────────────────────────────────

function normaliseProperty(raw: RawProperty): Property {
  return {
    ...raw,
    id: String(raw.id),
    owner_id: String(raw.owner_id),
    owner_name: raw.owner?.full_name ?? '',
    filmed_by: raw.filmed_by ?? undefined,
    is_filmed: raw.is_filmed ?? !!raw.filmed_by,
    building_status: raw.building_status ?? undefined,
    priority: raw.priority ?? false,
    activities: raw.activities ?? [],
    activity: raw.activity ?? undefined,
    area: raw.area ?? undefined,
    governorate_id: raw.governorate_id ?? undefined,
    area_id: raw.area_id ?? undefined,
    governorate: raw.governorate ?? undefined,
    area_name: raw.area_name ?? undefined,
    location_link: raw.location_link ?? undefined,
    description: raw.description ?? undefined,
    guard_name: raw.guard_name ?? undefined,
    guard_phone: raw.guard_phone ?? undefined,
    broker_id: raw.broker_id != null ? String(raw.broker_id) : undefined,
    manager_id: raw.manager_id != null ? String(raw.manager_id) : undefined,
    broker_name: raw.broker_name ?? undefined,
    broker_phone_num: raw.broker_phone_num ?? undefined,
    manager_name: raw.manager_name ?? undefined,
    manager_phone_num: raw.manager_phone_num ?? undefined,
    forsale_link: raw.forsale_link ?? undefined,
    instagram_link: raw.instagram_link ?? undefined,
    whatsapp_link: raw.whatsapp_link ?? undefined,
    marketing_status: raw.marketing_status ?? false,
    commission: raw.commission ?? undefined,
    notes: raw.notes ?? undefined,
    rent_amount: raw.rent_amount ?? undefined,
    price: raw.price ?? undefined,
    conditions: raw.conditions ?? undefined,
    grace_period: raw.grace_period ?? undefined,
    tenant_id: raw.tenant_id != null ? String(raw.tenant_id) : undefined,
    tenant_name: raw.tenant_name ?? undefined,
    tenant_start: raw.tenant_start ?? undefined,
    tenant_end: raw.tenant_end ?? undefined,
    sale_date: raw.sale_date ?? undefined,
    attachments: raw.attachments?.map(a => a.file_path) ?? [],
    public_link_token: raw.public_link_token ?? `tok-${raw.id}`,
    public_link_enabled: raw.public_link_enabled ?? false,
    public_show_price: raw.public_show_price ?? true,
    public_show_location: raw.public_show_location ?? true,
    public_show_contact: raw.public_show_contact ?? true,
    // Flattened off the relation so the list cell reads two plain fields.
    soums_count: raw.soums_count ?? 0,
    top_soum_amount: raw.top_soum ? Number(raw.top_soum.amount) : undefined,
    top_soum_date: raw.top_soum?.soum_date?.slice(0, 10),
  };
}

// ── DTOs ───────────────────────────────────────────────────────────────────

/**
 * Canonical property presentation data returned by GET /properties/{id}/view-data.
 * Mirrors the backend PropertyPresenter — the single source shared with the
 * public share link. `price` is already resolved (rent for rentals, else price).
 */
export interface PropertyViewData {
  type: 'property';
  name: string;
  property_type?: string;
  category?: string;
  activity?: string | null;
  status: string;
  area?: number | null;
  description?: string | null;
  price?: number | null;
  address?: string | null;
  location_link?: string | null;
  contact?: string | null;
  listing_type?: ListingType;
  conditions?: string | null;
  grace_period?: string | null;
}

export interface PropertyFormData {
  name: string;
  property_code: string;
  property_type: PropertyType;
  listing_type: ListingType;
  category: PropertyCategory;
  filmed_by?: string;
  /** حالة البناء — sent for عقارات البيع only; the backend nulls it on rentals. */
  building_status?: string | null;
  priority?: boolean;
  /** النشاط — activity names (many-to-many). Empty array clears them. */
  activities?: string[];
  owner_id?: string | number; // Required by backend on create; optional on update (sometimes)
  plot_number: string;
  area?: number;
  /** المحافظة — required on create; backend derives `address` from it. */
  governorate_id?: number;
  /** المنطقة — required on create; must belong to governorate_id. */
  area_id?: number;
  location_link?: string;
  description?: string;
  guard_name?: string;
  guard_phone?: string;
  /** الوسيط — client id (type 'وسيط'), or null to clear the link. */
  broker_id?: string | number | null;
  /** مسؤول العقار — client id (type 'مسؤول العقار'), or null to clear the link. */
  manager_id?: string | number | null;
  forsale_link?: string;
  instagram_link?: string;
  whatsapp_link?: string;
  /** حالة التسويق — تم / لم يتم. */
  marketing_status?: boolean;
  commission?: number;
  notes?: string;
  status: PropertyStatus;
  rent_amount?: number;
  price?: number;
  conditions?: string;
  grace_period?: string;
  // `tenant_name` is not writable — the backend derives it from this id.
  tenant_id?: string | number | null;
  tenant_start?: string;
  tenant_end?: string;
  sale_date?: string;
}

/**
 * List ordering, matching the whitelist in PropertyController::applySort.
 * `newest` is the backend default and is omitted from the query string.
 */
export type PropertySort = 'newest' | 'oldest' | 'code_asc' | 'code_desc';

/**
 * السوم filter. 'all' is the unset state and never reaches the query — the two
 * others become has_soums=1 / has_soums=0. A string rather than an optional
 * boolean because Radix reserves '' as a Select's clear value.
 */
export type SoumFilter = 'all' | 'with' | 'without';

export interface PropertyFilters {
  listing_type?: string;
  status?: string[];
  category?: string[];
  property_type?: string[];
  activity?: string[];
  /** حالة البناء — names; only عقارات البيع carry one. */
  building_status?: string[];
  governorate_id?: string[];
  area_id?: string[];
  /** المالك — client ids; the list is narrowed to properties owned by any of them. */
  owner_id?: string[];
  /** السوم — true keeps only listings with a bid, false only those without. */
  has_soums?: boolean;
  min_area?: number;
  max_area?: number;
  search?: string;
  sort?: PropertySort;
  page?: number;
  /** Page size; backend default is 20 and it caps the value at 500. */
  per_page?: number;
}

/**
 * The slim property shape returned by GET /properties/options — everything a
 * property combobox renders, plus the two fields the contract forms read off the
 * selection (`property_type` drives the unit selector, `owner_name` fills المالك).
 * A structural subset of `Property`, so a full record can be used in its place.
 */
export interface PropertyOption {
  id: string;
  property_code: string;
  name: string;
  address: string | null;
  property_type: PropertyType;
  owner_name: string;
  /** المستأجر recorded on the property, if any — the contract form prefills from it. */
  tenant_id?: string;
}

/**
 * Combobox label for a property. Built from the parts that are actually set — a
 * property with no governorate has a null address, which would otherwise print
 * "null" into the middle of the label.
 */
export function propertyOptionLabel(p: PropertyOption): string {
  return [p.property_code, p.name, p.address].filter(Boolean).join(' — ');
}

/** A مؤجر / مباع property still missing its contract. */
export interface PropertyWithoutContract {
  id: string;
  property_code: string;
  name: string;
  address: string | null;
  status: PropertyStatus;
  listing_type: ListingType;
  /** Last change to the property — the closest thing to "since when". */
  updated_at: string;
}

export interface PropertyOptionFilters {
  listing_type?: string;
  status?: string;
  search?: string;
  /** Filter on the contract flag; `false` asks for the not-yet-contracted ones. */
  has_contract?: boolean;
  /**
   * Force this property into the result even when it falls outside the filters
   * or the cap — the one already on a contract being edited is often no longer
   * متاح. It comes back first.
   */
  include?: string;
  /** Max search results (default 50, capped at 100). 0 returns only `include`. */
  limit?: number;
}

export interface PaginatedProperties {
  data: Property[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface LinkSettings {
  public_show_price?: boolean;
  public_show_location?: boolean;
  public_show_contact?: boolean;
}

/** A persisted property attachment, carrying the id needed to delete it. */
export interface PropertyAttachmentDto {
  id: string;
  url: string;
  file_name: string;
  file_type: string;
}

/**
 * Fields an empty value must still be sent for. A multipart body carries no
 * "unset" marker, so an omitted field leaves the stored value in place — which
 * for a relation id means the old broker/manager stays linked after the user
 * cleared the dropdown. Laravel's ConvertEmptyStringsToNull turns the '' back
 * into null, which the `nullable` rule accepts.
 */
const CLEARABLE_FIELDS = new Set(['broker_id', 'manager_id', 'tenant_id']);

/** Append non-empty form fields onto a FormData body for a multipart request. */
function appendFormData(fd: FormData, data: Partial<PropertyFormData>): void {
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      if (CLEARABLE_FIELDS.has(key)) fd.append(key, '');
      return;
    }
    // Arrays (e.g. activities) are appended separately as `key[]` entries.
    if (Array.isArray(value)) return;
    // Laravel's `boolean` rule rejects the strings "true"/"false"; send 1/0.
    fd.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  });
}

/**
 * Append the activities selection to a multipart body. Each name goes in as
 * `activities[]`; a `sync_activities` flag always accompanies it so the backend
 * clears the links when the selection is empty (multipart can't carry an empty
 * array on its own).
 */
function appendActivities(fd: FormData, activities?: string[]): void {
  (activities ?? []).forEach(a => fd.append('activities[]', a));
  fd.append('sync_activities', '1');
}

// ── Query builder ──────────────────────────────────────────────────────────

function buildQuery(filters: PropertyFilters): string {
  const params = new URLSearchParams();
  if (filters.listing_type)             params.set('listing_type', filters.listing_type);
  if (filters.search)                   params.set('search', filters.search);
  appendArrayParam(params, 'status',        filters.status);
  appendArrayParam(params, 'category',      filters.category);
  appendArrayParam(params, 'property_type', filters.property_type);
  appendArrayParam(params, 'activity',      filters.activity);
  appendArrayParam(params, 'building_status', filters.building_status);
  appendArrayParam(params, 'governorate_id', filters.governorate_id);
  appendArrayParam(params, 'area_id',        filters.area_id);
  appendArrayParam(params, 'owner_id',        filters.owner_id);
  // Sent whenever defined — `false` is the meaningful "بدون سوم" value, not a no-op.
  if (filters.has_soums != null)        params.set('has_soums', filters.has_soums ? '1' : '0');
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.min_area != null)         params.set('min_area', String(filters.min_area));
  if (filters.max_area != null)         params.set('max_area', String(filters.max_area));
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.per_page != null)         params.set('per_page', String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ── Service ────────────────────────────────────────────────────────────────

export const propertiesService = {
  /** GET /api/properties */
  async list(filters: PropertyFilters = {}): Promise<PaginatedProperties> {
    const raw = await apiClient.get<{
      data: RawProperty[];
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
    }>(`/properties${buildQuery(filters)}`);
    return { ...raw, data: raw.data.map(normaliseProperty) };
  },

  /**
   * GET /api/properties/options
   * Backend-searched dropdown options. Prefer this over `list()` for any select:
   * it is capped server-side and carries none of the relation payload.
   */
  async options(filters: PropertyOptionFilters = {}): Promise<PropertyOption[]> {
    const params = new URLSearchParams();
    if (filters.listing_type) params.set('listing_type', filters.listing_type);
    if (filters.status)       params.set('status', filters.status);
    if (filters.search)       params.set('search', filters.search);
    // Sent whenever defined — `false` is the meaningful value here, not a no-op.
    if (filters.has_contract != null) params.set('has_contract', filters.has_contract ? '1' : '0');
    if (filters.include)      params.set('include', filters.include);
    if (filters.limit != null) params.set('limit', String(filters.limit));
    const qs = params.toString();

    const raw = await apiClient.get<(Omit<PropertyOption, 'id' | 'tenant_id'> & { id: number; tenant_id?: number | null })[]>(
      `/properties/options${qs ? `?${qs}` : ''}`,
    );
    return raw.map(o => ({
      ...o,
      id: String(o.id),
      tenant_id: o.tenant_id != null ? String(o.tenant_id) : undefined,
    }));
  },

  /**
   * GET /api/properties/without-contract
   * مؤجر / مباع properties with no contract recorded — a live state query, not a
   * ledger, so a property drops out as soon as its contract is created.
   */
  async withoutContract(): Promise<PropertyWithoutContract[]> {
    const raw = await apiClient.get<(Omit<PropertyWithoutContract, 'id'> & { id: number })[]>(
      '/properties/without-contract',
    );
    return raw.map(p => ({ ...p, id: String(p.id) }));
  },

  /**
   * GET /api/properties/next-code
   * Suggested code for a new property; the user may edit it before saving.
   *
   * إيجار and بيع are numbered separately — each series starts at 1 — so the
   * listing type is required: it selects which series the suggestion comes from.
   */
  async nextCode(listingType: ListingType): Promise<string> {
    const raw = await apiClient.get<{ property_code: string }>(
      `/properties/next-code?listing_type=${encodeURIComponent(listingType)}`,
    );
    return raw.property_code;
  },

  /** GET /api/properties/{property} */
  async show(id: string): Promise<Property> {
    const raw = await apiClient.get<RawProperty>(`/properties/${id}`);
    return normaliseProperty(raw);
  },

  /**
   * POST /api/properties
   * When attachments are supplied, the request is sent as multipart/form-data so
   * the backend (PropertyController::store) can store each file and persist its path.
   */
  async create(data: PropertyFormData, attachments: File[] = []): Promise<Property> {
    if (attachments.length === 0) {
      const raw = await apiClient.post<RawProperty>('/properties', data);
      return normaliseProperty(raw);
    }

    const fd = new FormData();
    appendFormData(fd, data);
    appendActivities(fd, data.activities);
    attachments.forEach(file => fd.append('attachments[]', file));

    const raw = await apiClient.postForm<RawProperty>('/properties', fd);
    return normaliseProperty(raw);
  },

  /**
   * PUT /api/properties/{property}
   * When attachments are supplied, the request is sent as multipart POST with a
   * spoofed `_method=PUT` field — PHP only parses multipart bodies on POST, so a
   * real PUT would arrive with empty files. Newly uploaded files are appended.
   */
  async update(id: string, data: Partial<PropertyFormData>, attachments: File[] = []): Promise<Property> {
    if (attachments.length === 0) {
      const raw = await apiClient.put<RawProperty>(`/properties/${id}`, data);
      return normaliseProperty(raw);
    }

    const fd = new FormData();
    fd.append('_method', 'PUT');
    appendFormData(fd, data);
    appendActivities(fd, data.activities);
    attachments.forEach(file => fd.append('attachments[]', file));

    const raw = await apiClient.postForm<RawProperty>(`/properties/${id}`, fd);
    return normaliseProperty(raw);
  },

  /** GET /api/properties/{property} → existing attachments with the ids needed for deletion. */
  async getAttachments(id: string): Promise<PropertyAttachmentDto[]> {
    const raw = await apiClient.get<RawProperty>(`/properties/${id}`);
    return (raw.attachments ?? []).map(a => ({
      id: String(a.id),
      url: a.url ?? a.file_path,
      file_name: a.file_name,
      file_type: a.file_type,
    }));
  },

  /**
   * GET /api/properties/{property}/view-data
   * Canonical property presentation data shared with the public share link
   * (backend PropertyPresenter) — the single source the PDF renders from.
   */
  getViewData(id: string): Promise<PropertyViewData> {
    return apiClient.get<PropertyViewData>(`/properties/${id}/view-data`);
  },

  /** GET /api/properties/{property}/attachments-base64 → image attachments as data URIs (for PDF embedding). */
  async getImageDataUrls(id: string): Promise<string[]> {
    const raw = await apiClient.get<{ id: number; file_name: string; data_url: string }[]>(
      `/properties/${id}/attachments-base64`,
    );
    return raw.map(a => a.data_url);
  },

  /** DELETE /api/properties/{property}/attachments/{attachment} */
  deleteAttachment(propertyId: string, attachmentId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/properties/${propertyId}/attachments/${attachmentId}`);
  },

  /** DELETE /api/properties/{property} */
  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/properties/${id}`);
  },

  /** POST /api/properties/{property}/toggle-link */
  toggleLink(id: string): Promise<{ public_link_enabled: boolean }> {
    return apiClient.post<{ public_link_enabled: boolean }>(`/properties/${id}/toggle-link`, {});
  },

  /** POST /api/properties/{property}/link-settings */
  async linkSettings(id: string, settings: LinkSettings): Promise<Property> {
    const raw = await apiClient.post<RawProperty>(`/properties/${id}/link-settings`, settings);
    return normaliseProperty(raw);
  },

  /**
   * Available properties that match a given request (same listing type, category,
   * activity, and area, and status متاح). GET /requests/{id}/matching-properties
   *
   * `options` carries the معايير مطابقة اضافية: size and price are matched exactly
   * unless the matching flag is set, which widens that field to a ± percentage band.
   */
  async matchingForRequest(requestId: string, options: MatchOptions = {}): Promise<Property[]> {
    const params = new URLSearchParams();
    appendMatchOptions(params, options);
    const qs = params.toString();
    const raw = await apiClient.get<RawProperty[]>(`/requests/${requestId}/matching-properties${qs ? `?${qs}` : ''}`);
    return raw.map(normaliseProperty);
  },
};
