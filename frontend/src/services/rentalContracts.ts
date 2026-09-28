import { apiClient } from './api';
import { appendArrayParam } from '@/lib/query';
import { RentalContract, RentalContractDocument, RentalDocumentType, PaymentPeriod, PaymentMethod, ContractStatus } from '@/types';

// ── Documents ───────────────────────────────────────────────────────────────

/** All document slots in display order. `required` flags apply on create only;
 *  `companyOnly` slots are required only when the tenant is a company (شركة). */
export const RENTAL_DOCUMENT_SLOTS: { type: RentalDocumentType; label: string; companyOnly: boolean }[] = [
  { type: 'civil_id',                label: 'بطاقة مدنية',   companyOnly: false },
  { type: 'license',                 label: 'ترخيص',         companyOnly: false },
  { type: 'incorporation_contract',  label: 'عقد تأسيس',     companyOnly: true },
  { type: 'signature_authorization', label: 'اعتماد توقيع',  companyOnly: true },
  { type: 'commercial_extract',      label: 'مستخرج',        companyOnly: true },
];

/** Map of picked files keyed by slot type, sent as multipart fields. */
export type RentalContractDocuments = Partial<Record<RentalDocumentType, File>>;

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

interface RawTenant {
  id: number;
  full_name: string;
  phone: string;
}

interface RawDocument {
  id: number;
  type: RentalDocumentType;
  file_name: string;
  url: string;
}

interface RawRentalContract {
  id: number;
  contract_number: string;
  property_id: number;
  unit_id: number | null;
  tenant_id: number;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_period: PaymentPeriod;
  payment_method: PaymentMethod;
  deposit_amount: number | null;
  notes: string | null;
  status: ContractStatus;
  created_at: string;
  property: RawProperty | null;
  unit: RawUnit | null;
  tenant: RawTenant | null;
  documents?: RawDocument[];
}

// ── Normaliser ─────────────────────────────────────────────────────────────

/**
 * The backend casts start_date/end_date as Laravel `date`, so they arrive as full
 * ISO strings (e.g. "2024-01-15T00:00:00.000000Z"). Trim to the YYYY-MM-DD that
 * both the table display and <input type="date"> expect.
 */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

function normalise(raw: RawRentalContract): RentalContract {
  return {
    id: String(raw.id),
    contract_number: raw.contract_number,
    property_id: String(raw.property_id),
    property_name: raw.property?.name ?? '',
    unit_id: raw.unit_id ? String(raw.unit_id) : undefined,
    unit_number: raw.unit?.unit_number ?? undefined,
    owner_name: raw.property?.owner?.full_name ?? '',
    tenant_id: String(raw.tenant_id),
    tenant_name: raw.tenant?.full_name ?? '',
    tenant_phone: raw.tenant?.phone ?? '',
    created_at: toDateInput(raw.created_at),
    start_date: toDateInput(raw.start_date),
    end_date: toDateInput(raw.end_date),
    total_amount: raw.total_amount,
    payment_period: raw.payment_period,
    payment_method: raw.payment_method,
    deposit_amount: raw.deposit_amount ?? undefined,
    notes: raw.notes ?? undefined,
    status: raw.status,
    documents: (raw.documents ?? []).map(normaliseDocument),
  };
}

function normaliseDocument(raw: RawDocument): RentalContractDocument {
  return { id: String(raw.id), type: raw.type, file_name: raw.file_name, url: raw.url };
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface PaginatedRentalContracts {
  data: RentalContract[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface RentalContractFilters {
  search?: string;
  status?: string[];
  payment_method?: string[];
  page?: number;
  /** Page size; backend default is 20 and it caps the value at 500. */
  per_page?: number;
}

export type RentalContractFormData = {
  contract_number?: string;
  property_id: string | number;
  unit_id?: string | number | null;
  tenant_id: string | number;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_period: PaymentPeriod;
  payment_method: PaymentMethod;
  deposit_amount?: number | null;
  notes?: string;
  status: 'مسودة' | 'نشط';
};

export type ContractStats = Record<'نشط' | 'مسودة' | 'منتهي' | 'ملغي', number>;

// ── Query builder ──────────────────────────────────────────────────────────

/** Append non-empty contract fields onto a FormData body for a multipart request. */
function appendFormData(fd: FormData, data: Partial<RentalContractFormData>): void {
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    fd.append(key, String(value));
  });
}

/** Append picked document files as named multipart fields (civil_id, license, …). */
function appendDocuments(fd: FormData, documents: RentalContractDocuments): void {
  Object.entries(documents).forEach(([type, file]) => {
    if (file) fd.append(type, file);
  });
}

function buildQuery(filters: RentalContractFilters): string {
  const params = new URLSearchParams();
  if (filters.search)                                              params.set('search', filters.search);
  appendArrayParam(params, 'status',         filters.status);
  appendArrayParam(params, 'payment_method', filters.payment_method);
  if (filters.page          && filters.page          > 1)         params.set('page', String(filters.page));
  if (filters.per_page      != null)                              params.set('per_page', String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ── Service ────────────────────────────────────────────────────────────────

export const rentalContractsService = {
  /** GET /api/rental-contracts */
  async list(filters: RentalContractFilters = {}): Promise<PaginatedRentalContracts> {
    const raw = await apiClient.get<{
      data: RawRentalContract[];
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
    }>(`/rental-contracts${buildQuery(filters)}`);
    return { ...raw, data: raw.data.map(normalise) };
  },

  /** GET /api/rental-contracts/stats */
  stats(): Promise<ContractStats> {
    return apiClient.get<ContractStats>('/rental-contracts/stats');
  },

  /** GET /api/rental-contracts/{id} */
  async show(id: string): Promise<RentalContract> {
    const raw = await apiClient.get<RawRentalContract>(`/rental-contracts/${id}`);
    return normalise(raw);
  },

  /**
   * POST /api/rental-contracts
   * Contracts always carry required document uploads, so the request is sent as
   * multipart/form-data (RentalContractController::store stores each named file).
   */
  async create(data: RentalContractFormData, documents: RentalContractDocuments = {}): Promise<RentalContract> {
    const fd = new FormData();
    appendFormData(fd, data);
    appendDocuments(fd, documents);

    const raw = await apiClient.postForm<RawRentalContract>('/rental-contracts', fd);
    return normalise(raw);
  },

  /**
   * PUT /api/rental-contracts/{id}
   * When documents are re-uploaded the request is sent as multipart POST with a
   * spoofed `_method=PUT` field — PHP only parses multipart bodies on POST, so a
   * real PUT would arrive with empty files. A re-uploaded file replaces its slot.
   */
  async update(id: string, data: Partial<RentalContractFormData>, documents: RentalContractDocuments = {}): Promise<RentalContract> {
    const hasFiles = Object.values(documents).some(Boolean);
    if (!hasFiles) {
      const raw = await apiClient.put<RawRentalContract>(`/rental-contracts/${id}`, data);
      return normalise(raw);
    }

    const fd = new FormData();
    fd.append('_method', 'PUT');
    appendFormData(fd, data);
    appendDocuments(fd, documents);

    const raw = await apiClient.postForm<RawRentalContract>(`/rental-contracts/${id}`, fd);
    return normalise(raw);
  },

  /** DELETE /api/rental-contracts/{id} */
  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/rental-contracts/${id}`);
  },

  /** DELETE /api/rental-contracts/{id}/documents/{documentId} */
  removeDocument(id: string, documentId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/rental-contracts/${id}/documents/${documentId}`);
  },
};
