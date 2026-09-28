import { apiClient } from './api';
import { appendArrayParam } from '@/lib/query';
import {
  Collection, CollectionType, CollectionPaymentMethod, Beneficiary, CardType,
  CollectionMethod, PaymentLinkGateway, PaymentLinkChannel, PaymentStatus,
} from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaginatedCollections {
  data: Collection[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface CollectionFilters {
  search?: string;
  collection_type?: string[];
  payment_method?: string[];
  beneficiary?: string[];
  date_from?: string;
  date_to?: string;
  page?: number;
  /** Page size; backend default is 20 and it caps the value at 500. */
  per_page?: number;
}

export interface CollectionStats {
  total: number;
  totalAmount: number;
  officeAmount: number;
  invoicesCount: number;
}

export interface CollectionFormData {
  collection_type: CollectionType;
  client_id: string;
  property_id?: string;
  unit_id?: string;
  broker?: string;
  beneficiary: Beneficiary;
  amount: number;
  collection_method?: CollectionMethod;
  payment_date: string;
  payment_method: CollectionPaymentMethod;
  payment_link_expiry_days?: number;
  payment_link_reminder_days?: number;
  payment_link_gateways?: PaymentLinkGateway[];
  payment_link_channel?: PaymentLinkChannel;
  payment_gateway_id?: string;
  check_number?: string;
  check_bank?: string;
  check_date?: string;
  transfer_bank?: string;
  transfer_transaction_number?: string;
  transfer_date?: string;
  card_type?: CardType;
  card_transaction_number?: string;
  card_last4?: string;
  notes?: string;
  has_invoice?: boolean;
}

/** An attachment already persisted on the backend (with the id needed to delete it). */
export interface CollectionAttachmentDto {
  id: string;
  url: string;
  file_name: string;
}

/** Append non-empty form fields onto a FormData body for a multipart request. */
function appendFormData(fd: FormData, data: Partial<CollectionFormData>): void {
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    // Arrays go out as `key[]` entries — String() on an array would hand PHP one
    // comma-joined string where the JSON path sends a real array.
    if (Array.isArray(value)) {
      value.forEach(item => fd.append(`${key}[]`, String(item)));
      return;
    }
    // Cast booleans to 1/0 so PHP's `boolean` validation rule accepts them.
    fd.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  });
}

// ── Backend raw shape ──────────────────────────────────────────────────────

export interface RawCollection {
  id: number;
  collection_number: string;
  collection_type: string;
  client_id: number;
  property_id?: number | null;
  unit_id?: number | null;
  broker?: string | null;
  beneficiary: string;
  amount: string | number;
  collection_method?: string | null;
  payment_date: string;
  payment_method: string;
  payment_link_expiry_days?: number | string | null;
  payment_link_reminder_days?: number | string | null;
  payment_link_gateways?: string[] | string | null;
  payment_link_channel?: string | null;
  payment_gateway_id?: number | string | null;
  // Appended by the model — absolute URL, already built from the secret token.
  payment_link_url?: string | null;
  payment_status?: string | null;
  payment_link_expires_at?: string | null;
  check_number?: string | null;
  check_bank?: string | null;
  check_date?: string | null;
  transfer_bank?: string | null;
  transfer_transaction_number?: string | null;
  transfer_date?: string | null;
  card_type?: string | null;
  card_transaction_number?: string | null;
  card_last4?: string | null;
  notes?: string | null;
  has_invoice: boolean | number;
  invoice_number?: string | null;
  created_at: string;
  client?: { id: number; full_name: string; phone?: string } | null;
  property?: { id: number; name: string } | null;
  unit?: { id: number; unit_number: string } | null;
  // Loaded with pinned columns server-side — never carries the gateway credentials.
  payment_gateway?: { id: number; name: string; gateway: string } | null;
  attachments?: Array<{ id: number; file_path: string; file_name: string; url?: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQuery(filters: CollectionFilters): string {
  const params = new URLSearchParams();
  if (filters.search)                                                   params.set('search',          filters.search);
  appendArrayParam(params, 'collection_type', filters.collection_type);
  appendArrayParam(params, 'payment_method',  filters.payment_method);
  appendArrayParam(params, 'beneficiary',     filters.beneficiary);
  if (filters.date_from)                                                params.set('date_from',       filters.date_from);
  if (filters.date_to)                                                  params.set('date_to',         filters.date_to);
  if (filters.page && filters.page > 1)                                 params.set('page',            String(filters.page));
  if (filters.per_page != null)                                         params.set('per_page',        String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Reduce a backend date value to the `YYYY-MM-DD` a `<input type="date">` needs.
 * The `date` cast serialises as ISO-8601 (`2026-07-19T00:00:00.000000Z`), which a
 * date input rejects — leaving the field blank on edit.
 */
function toDateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : '';
}

/**
 * Normalise the stored gateway list. A `json`/`array` cast hands back an array,
 * but a plain string column comes back as raw JSON or a comma-joined string —
 * accept all three rather than letting the field render as one bogus option.
 */
function toGatewayList(value?: string[] | string | null): PaymentLinkGateway[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value as PaymentLinkGateway[];

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as PaymentLinkGateway[];
    } catch {
      // Fall through to the comma split below.
    }
  }
  return trimmed.split(',').map(g => g.trim()).filter(Boolean) as PaymentLinkGateway[];
}

/** Coerce backend integers to strings and flatten eager-loaded relations. */
export function normaliseCollection(raw: RawCollection): Collection {
  return {
    id:                          String(raw.id),
    collection_number:           raw.collection_number,
    collection_type:             raw.collection_type as CollectionType,
    client_id:                   String(raw.client_id),
    client_name:                 raw.client?.full_name ?? '',
    client_phone:                raw.client?.phone ?? '',
    property_id:                 raw.property_id != null ? String(raw.property_id) : undefined,
    property_name:               raw.property?.name ?? undefined,
    unit_id:                     raw.unit_id != null ? String(raw.unit_id) : undefined,
    unit_number:                 raw.unit?.unit_number ?? undefined,
    broker:                      raw.broker ?? undefined,
    beneficiary:                 raw.beneficiary as Beneficiary,
    amount:                      Number(raw.amount),
    collection_method:           (raw.collection_method as CollectionMethod) ?? 'manual',
    payment_date:                toDateInput(raw.payment_date),
    payment_method:              raw.payment_method as CollectionPaymentMethod,
    payment_link_expiry_days:    raw.payment_link_expiry_days != null ? Number(raw.payment_link_expiry_days) : undefined,
    payment_link_reminder_days:  raw.payment_link_reminder_days != null ? Number(raw.payment_link_reminder_days) : undefined,
    payment_link_gateways:       toGatewayList(raw.payment_link_gateways),
    payment_link_channel:        (raw.payment_link_channel as PaymentLinkChannel) ?? undefined,
    payment_gateway_id:          raw.payment_gateway_id != null ? String(raw.payment_gateway_id) : undefined,
    payment_gateway_name:        raw.payment_gateway?.name ?? undefined,
    payment_link_url:            raw.payment_link_url ?? undefined,
    payment_status:              (raw.payment_status as PaymentStatus) ?? undefined,
    payment_link_expires_at:     raw.payment_link_expires_at ?? undefined,
    check_number:                raw.check_number ?? undefined,
    check_bank:                  raw.check_bank ?? undefined,
    check_date:                  raw.check_date ? toDateInput(raw.check_date) : undefined,
    transfer_bank:               raw.transfer_bank ?? undefined,
    transfer_transaction_number: raw.transfer_transaction_number ?? undefined,
    transfer_date:               raw.transfer_date ? toDateInput(raw.transfer_date) : undefined,
    card_type:                   (raw.card_type as CardType) ?? undefined,
    card_transaction_number:     raw.card_transaction_number ?? undefined,
    card_last4:                  raw.card_last4 ?? undefined,
    notes:                       raw.notes ?? undefined,
    attachments:                 (raw.attachments ?? []).map(a => a.url ?? `/storage/${a.file_path}`),
    has_invoice:                 Boolean(raw.has_invoice),
    invoice_number:              raw.invoice_number ?? undefined,
    created_at:                  raw.created_at,
  };
}

// ── Service ────────────────────────────────────────────────────────────────

export const collectionsService = {
  /** GET /api/collections */
  async list(filters: CollectionFilters = {}): Promise<PaginatedCollections> {
    const raw = await apiClient.get<{
      data: RawCollection[];
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
    }>(`/collections${buildQuery(filters)}`);
    return { ...raw, data: raw.data.map(normaliseCollection) };
  },

  /** GET /api/collections/stats — counters over the whole filtered dataset */
  stats(filters: CollectionFilters = {}): Promise<CollectionStats> {
    return apiClient.get<CollectionStats>(`/collections/stats${buildQuery(filters)}`);
  },

  /** GET /api/collections/{id} */
  async show(id: string): Promise<Collection> {
    const raw = await apiClient.get<RawCollection>(`/collections/${id}`);
    return normaliseCollection(raw);
  },

  /**
   * POST /api/collections
   * When attachments are supplied, the request is sent as multipart/form-data so
   * the backend (CollectionController::store) can store each file and persist its path.
   */
  async create(data: CollectionFormData, attachments: File[] = []): Promise<Collection> {
    if (attachments.length === 0) {
      const raw = await apiClient.post<RawCollection>('/collections', data);
      return normaliseCollection(raw);
    }

    const fd = new FormData();
    appendFormData(fd, data);
    attachments.forEach(file => fd.append('attachments[]', file));

    const raw = await apiClient.postForm<RawCollection>('/collections', fd);
    return normaliseCollection(raw);
  },

  /**
   * PUT /api/collections/{id}
   * When attachments are supplied, the request is sent as multipart POST with a
   * spoofed `_method=PUT` field — PHP only parses multipart bodies on POST, so a
   * real PUT would arrive with empty files. Newly uploaded files are appended.
   */
  async update(id: string, data: Partial<CollectionFormData>, attachments: File[] = []): Promise<Collection> {
    if (attachments.length === 0) {
      const raw = await apiClient.put<RawCollection>(`/collections/${id}`, data);
      return normaliseCollection(raw);
    }

    const fd = new FormData();
    fd.append('_method', 'PUT');
    appendFormData(fd, data);
    attachments.forEach(file => fd.append('attachments[]', file));

    const raw = await apiClient.postForm<RawCollection>(`/collections/${id}`, fd);
    return normaliseCollection(raw);
  },

  /** GET /api/collections/{id} → existing attachments with the ids needed for deletion. */
  async getAttachments(id: string): Promise<CollectionAttachmentDto[]> {
    const raw = await apiClient.get<RawCollection>(`/collections/${id}`);
    return (raw.attachments ?? []).map(a => ({
      id: String(a.id),
      url: a.url ?? `/storage/${a.file_path}`,
      file_name: a.file_name,
    }));
  },

  /** DELETE /api/collections/{id}/attachments/{attachmentId} */
  deleteAttachment(collectionId: string, attachmentId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/collections/${collectionId}/attachments/${attachmentId}`);
  },

  /** DELETE /api/collections/{id} */
  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/collections/${id}`);
  },

  /**
   * POST /api/collections/{id}/send-payment-link
   * Mails the link to the client's stored address. Rejects with an ApiError
   * carrying a displayable `message` when the client has no email on file.
   */
  sendPaymentLinkEmail(id: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`/collections/${id}/send-payment-link`, {});
  },

  /**
   * POST /api/collections/{id}/regenerate-payment-link
   * Issues a replacement link — new token, expiry restarted from now — and kills
   * the old URL. Resolves with the refreshed collection; rejects with an ApiError
   * carrying a displayable `message` when the collection is already paid.
   */
  async regeneratePaymentLink(id: string): Promise<Collection> {
    const raw = await apiClient.post<RawCollection>(`/collections/${id}/regenerate-payment-link`, {});
    return normaliseCollection(raw);
  },

  /** POST /api/collections/{id}/generate-invoice */
  generateInvoice(id: string): Promise<{ invoice_number: string; message?: string }> {
    return apiClient.post<{ invoice_number: string; message?: string }>(
      `/collections/${id}/generate-invoice`,
      {},
    );
  },
};
