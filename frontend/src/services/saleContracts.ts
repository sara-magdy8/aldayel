import { apiClient } from './api';
import { appendArrayParam } from '@/lib/query';
import { SaleContract, SaleContractDocument, SaleDocumentType, PaymentMethod, ContractStatus } from '@/types';

// ── Documents ───────────────────────────────────────────────────────────────

/** All document slots in display order. `required` flags apply on create only;
 *  `companyOnly` slots are required only when the buyer is a company (شركة). */
export const SALE_DOCUMENT_SLOTS: { type: SaleDocumentType; label: string; companyOnly: boolean }[] = [
  { type: 'civil_id',                label: 'بطاقة مدنية',   companyOnly: false },
  { type: 'license',                 label: 'ترخيص',         companyOnly: false },
  { type: 'incorporation_contract',  label: 'عقد تأسيس',     companyOnly: true },
  { type: 'signature_authorization', label: 'اعتماد توقيع',  companyOnly: true },
  { type: 'commercial_extract',      label: 'مستخرج',        companyOnly: true },
];

/** Map of picked files keyed by slot type, sent as multipart fields. */
export type SaleContractDocuments = Partial<Record<SaleDocumentType, File>>;

// ── Backend raw types ──────────────────────────────────────────────────────

interface RawOwner {
  id: number;
  full_name: string;
  phone?: string;
}

interface RawProperty {
  id: number;
  name: string;
  owner_id: number;
  owner?: RawOwner;
}

interface RawUnit {
  id: number;
  unit_number: string;
}

interface RawBuyer {
  id: number;
  full_name: string;
  phone: string;
}

interface RawDocument {
  id: number;
  type: SaleDocumentType;
  file_name: string;
  url: string;
}

interface RawSaleContract {
  id: number;
  contract_number: string;
  property_id: number;
  unit_id: number | null;
  buyer_id: number;
  contract_date: string;
  delivery_date: string | null;
  total_amount: number;
  payment_method: PaymentMethod;
  down_payment: number | null;
  notes: string | null;
  status: ContractStatus;
  created_at: string;
  property: RawProperty | null;
  unit: RawUnit | null;
  buyer: RawBuyer | null;
  documents?: RawDocument[];
}

// ── Normaliser ─────────────────────────────────────────────────────────────

/**
 * The backend casts contract_date/delivery_date as Laravel `date`, so they arrive as full
 * ISO strings (e.g. "2024-01-15T00:00:00.000000Z"). Trim to YYYY-MM-DD for display
 * and <input type="date"> compatibility.
 */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

function normalise(raw: RawSaleContract): SaleContract {
  return {
    id: String(raw.id),
    contract_number: raw.contract_number,
    property_id: String(raw.property_id),
    property_name: raw.property?.name ?? '',
    unit_id: raw.unit_id ? String(raw.unit_id) : undefined,
    unit_number: raw.unit?.unit_number ?? undefined,
    owner_name: raw.property?.owner?.full_name ?? '',
    buyer_id: String(raw.buyer_id),
    buyer_name: raw.buyer?.full_name ?? '',
    buyer_phone: raw.buyer?.phone ?? '',
    created_at: toDateInput(raw.created_at),
    contract_date: toDateInput(raw.contract_date),
    delivery_date: raw.delivery_date ? toDateInput(raw.delivery_date) : undefined,
    total_amount: raw.total_amount,
    payment_method: raw.payment_method,
    down_payment: raw.down_payment ?? undefined,
    notes: raw.notes ?? undefined,
    status: raw.status,
    documents: (raw.documents ?? []).map(normaliseDocument),
  };
}

function normaliseDocument(raw: RawDocument): SaleContractDocument {
  return { id: String(raw.id), type: raw.type, file_name: raw.file_name, url: raw.url };
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface PaginatedSaleContracts {
  data: SaleContract[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface SaleContractFilters {
  search?: string;
  status?: string[];
  payment_method?: string[];
  page?: number;
  /** Page size; backend default is 20 and it caps the value at 500. */
  per_page?: number;
}

export type SaleContractFormData = {
  contract_number?: string;
  property_id: string | number;
  unit_id?: string | number | null;
  buyer_id: string | number;
  contract_date: string;
  delivery_date?: string;
  total_amount: number;
  payment_method: PaymentMethod;
  down_payment?: number | null;
  notes?: string;
  status: 'مسودة' | 'نشط';
};

export type SaleContractStats = Record<'نشط' | 'مسودة' | 'مكتمل' | 'ملغي', number>;

// ── Query builder ──────────────────────────────────────────────────────────

/** Append non-empty contract fields onto a FormData body for a multipart request. */
function appendFormData(fd: FormData, data: Partial<SaleContractFormData>): void {
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    fd.append(key, String(value));
  });
}

/** Append picked document files as named multipart fields (civil_id, license, …). */
function appendDocuments(fd: FormData, documents: SaleContractDocuments): void {
  Object.entries(documents).forEach(([type, file]) => {
    if (file) fd.append(type, file);
  });
}

function buildQuery(filters: SaleContractFilters): string {
  const params = new URLSearchParams();
  if (filters.search)                                                   params.set('search', filters.search);
  appendArrayParam(params, 'status',         filters.status);
  appendArrayParam(params, 'payment_method', filters.payment_method);
  if (filters.page           && filters.page           > 1)            params.set('page', String(filters.page));
  if (filters.per_page       != null)                                  params.set('per_page', String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ── Service ────────────────────────────────────────────────────────────────

export const saleContractsService = {
  /** GET /api/sale-contracts */
  async list(filters: SaleContractFilters = {}): Promise<PaginatedSaleContracts> {
    const raw = await apiClient.get<{
      data: RawSaleContract[];
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
    }>(`/sale-contracts${buildQuery(filters)}`);
    return { ...raw, data: raw.data.map(normalise) };
  },

  /** GET /api/sale-contracts/stats */
  stats(): Promise<SaleContractStats> {
    return apiClient.get<SaleContractStats>('/sale-contracts/stats');
  },

  /** GET /api/sale-contracts/{id} */
  async show(id: string): Promise<SaleContract> {
    const raw = await apiClient.get<RawSaleContract>(`/sale-contracts/${id}`);
    return normalise(raw);
  },

  /**
   * POST /api/sale-contracts
   * Contracts always carry required document uploads, so the request is sent as
   * multipart/form-data (SaleContractController::store stores each named file).
   */
  async create(data: SaleContractFormData, documents: SaleContractDocuments = {}): Promise<SaleContract> {
    const fd = new FormData();
    appendFormData(fd, data);
    appendDocuments(fd, documents);

    const raw = await apiClient.postForm<RawSaleContract>('/sale-contracts', fd);
    return normalise(raw);
  },

  /**
   * PUT /api/sale-contracts/{id}
   * When documents are re-uploaded the request is sent as multipart POST with a
   * spoofed `_method=PUT` field — PHP only parses multipart bodies on POST, so a
   * real PUT would arrive with empty files. A re-uploaded file replaces its slot.
   */
  async update(id: string, data: Partial<SaleContractFormData>, documents: SaleContractDocuments = {}): Promise<SaleContract> {
    const hasFiles = Object.values(documents).some(Boolean);
    if (!hasFiles) {
      const raw = await apiClient.put<RawSaleContract>(`/sale-contracts/${id}`, data);
      return normalise(raw);
    }

    const fd = new FormData();
    fd.append('_method', 'PUT');
    appendFormData(fd, data);
    appendDocuments(fd, documents);

    const raw = await apiClient.postForm<RawSaleContract>(`/sale-contracts/${id}`, fd);
    return normalise(raw);
  },

  /** DELETE /api/sale-contracts/{id} */
  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/sale-contracts/${id}`);
  },

  /** DELETE /api/sale-contracts/{id}/documents/{documentId} */
  removeDocument(id: string, documentId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/sale-contracts/${id}/documents/${documentId}`);
  },
};
