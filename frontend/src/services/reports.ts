import { apiClient } from './api';
import { appendArrayParam } from '@/lib/query';
import { ContractStatus } from '@/types';

// ── Summary ───────────────────────────────────────────────────────────────────

export interface ReportStatusCount {
  status: string;
  count: number;
}

export interface ReportSummary {
  total_properties: number;
  properties_by_status: ReportStatusCount[];
  total_units: number;
  units_by_status: ReportStatusCount[];
  total_clients: number;
  open_requests: number;
  active_contracts: number;
  total_collections: number;
  today_collections: number;
  month_collections: number;
}

// ── Collections report ────────────────────────────────────────────────────────

export interface ReportCollectionFilters {
  date_from?: string;
  date_to?: string;
  collection_type?: string[];
  beneficiary?: string[];
  payment_method?: string[];
}

export interface ReportCollection {
  id: string;
  collection_number: string;
  collection_type: string;
  client_name: string;
  property_name?: string;
  beneficiary: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  has_invoice: boolean;
}

export interface CollectionsReportData {
  collections: ReportCollection[];
  total_amount: number;
  count: number;
  average: number;
  /** Arabic name → total amount */
  by_type: Record<string, number>;
}

// ── Properties report ─────────────────────────────────────────────────────────

export interface ReportPropertyFilters {
  listing_type?: string[];
  status?: string[];
  category?: string[];
}

export interface ReportProperty {
  id: string;
  name: string;
  listing_type: string;
  category?: string;
  owner_name: string;
  address: string;
  status?: string;
  created_at: string;
}

export interface PropertiesReportData {
  properties: ReportProperty[];
  /** Global (unfiltered) counts per category */
  by_category: Array<{ category: string; count: number }>;
  /** Global (unfiltered) counts per status */
  by_status: ReportStatusCount[];
  /**
   * Global (unfiltered) counts per listing_type.
   * listing_type is the raw DB integer: 0 = إيجار, 1 = بيع.
   */
  by_type: Array<{ listing_type: number; count: number }>;
}

// ── Contracts report ──────────────────────────────────────────────────────────

export interface ReportContractFilters {
  status?: string[];
}

interface RawReportContractProperty {
  id: number;
  name: string;
  owner?: { id: number; full_name: string };
}

export interface RawReportRentalContract {
  id: number;
  contract_number: string;
  property_id: number;
  property?: RawReportContractProperty;
  unit_id?: number | null;
  tenant_id: number;
  tenant?: { id: number; full_name: string; phone: string };
  start_date: string;
  end_date: string;
  total_amount: number;
  status: ContractStatus;
  created_at: string;
}

export interface RawReportSaleContract {
  id: number;
  contract_number: string;
  property_id: number;
  property?: RawReportContractProperty;
  unit_id?: number | null;
  buyer_id: number;
  buyer?: { id: number; full_name: string; phone: string };
  contract_date: string;
  delivery_date?: string | null;
  total_amount: number;
  status: ContractStatus;
  created_at: string;
}

export interface ContractsReportData {
  rental_contracts: RawReportRentalContract[];
  sale_contracts: RawReportSaleContract[];
  /** Sum of active rental contracts' total_amount (global, unfiltered). */
  total_rental_value: number;
  /** Sum of active+completed sale contracts' total_amount (global, unfiltered). */
  total_sale_value: number;
  /** Active rental contracts expiring within 60 days (global, unfiltered). */
  expiring_soon: number;
}

/** Normalised union row for the contracts table display. */
export interface ContractRow {
  id: string;
  number: string;
  type: 'إيجار' | 'بيع';
  property: string;
  party: string;
  amount: number;
  startDate: string;
  endDate: string;
  status: ContractStatus;
}

// ── Clients report ────────────────────────────────────────────────────────────

export interface ReportClientFilters {
  type?: string[];
  status?: string[];
}

export interface ReportClient {
  id: string;
  full_name: string;
  phone: string;
  type: string;
  status: string;
  requests_count: number;
  rental_contracts_count: number;
  sale_contracts_count: number;
  collections_count: number;
  created_at: string;
}

export interface ClientsReportData {
  clients: ReportClient[];
  /** Raw DB values: 0 = فرد, 1 = شركة */
  by_type: Array<{ type: number; count: number }>;
  /** Raw DB values: 0 = غير نشط, 1 = نشط */
  by_status: Array<{ status: number; count: number }>;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const reportsService = {
  /** GET /api/reports/summary */
  summary(): Promise<ReportSummary> {
    return apiClient.get<ReportSummary>('/reports/summary');
  },

  /** GET /api/reports/collections */
  async collections(filters: ReportCollectionFilters = {}): Promise<CollectionsReportData> {
    const params = new URLSearchParams();
    if (filters.date_from)                                                   params.set('date_from',       filters.date_from);
    if (filters.date_to)                                                     params.set('date_to',         filters.date_to);
    appendArrayParam(params, 'collection_type', filters.collection_type);
    appendArrayParam(params, 'beneficiary',     filters.beneficiary);
    appendArrayParam(params, 'payment_method',  filters.payment_method);
    const qs = params.toString();

    const raw = await apiClient.get<{
      collections: Array<{
        id: number;
        collection_number: string;
        collection_type: string;
        beneficiary: string;
        amount: number | string;
        payment_date: string;
        payment_method: string;
        has_invoice: boolean;
        client?: { full_name: string };
        property?: { name: string };
      }>;
      total_amount: number;
      count: number;
      average: number;
      by_type: Record<string, number>;
    }>(`/reports/collections${qs ? `?${qs}` : ''}`);

    return {
      ...raw,
      collections: raw.collections.map(c => ({
        id: String(c.id),
        collection_number: c.collection_number,
        collection_type: c.collection_type,
        client_name: c.client?.full_name ?? '',
        property_name: c.property?.name,
        beneficiary: c.beneficiary,
        amount: Number(c.amount),
        payment_date: c.payment_date,
        payment_method: c.payment_method,
        has_invoice: Boolean(c.has_invoice),
      })),
    };
  },

  /** GET /api/reports/properties */
  async properties(filters: ReportPropertyFilters = {}): Promise<PropertiesReportData> {
    const params = new URLSearchParams();
    appendArrayParam(params, 'listing_type', filters.listing_type);
    appendArrayParam(params, 'status',       filters.status);
    appendArrayParam(params, 'category',     filters.category);
    const qs = params.toString();

    const raw = await apiClient.get<{
      properties: Array<Record<string, unknown>>;
      by_category: Array<{ category: string; count: number }>;
      by_status: ReportStatusCount[];
      by_type: Array<{ listing_type: number; count: number }>;
    }>(`/reports/properties${qs ? `?${qs}` : ''}`);

    return {
      ...raw,
      properties: raw.properties.map(p => ({
        id: String(p.id),
        name: String(p.name ?? ''),
        listing_type: String(p.listing_type ?? ''),
        category: p.category != null ? String(p.category) : undefined,
        owner_name: (p.owner as { full_name?: string } | null)?.full_name ?? '',
        address: String(p.address ?? ''),
        status: p.status != null ? String(p.status) : undefined,
        created_at: String(p.created_at ?? '').slice(0, 10),
      })),
    };
  },

  /** GET /api/reports/contracts */
  contracts(filters: ReportContractFilters = {}): Promise<ContractsReportData> {
    const params = new URLSearchParams();
    appendArrayParam(params, 'status', filters.status);
    const qs = params.toString();
    return apiClient.get<ContractsReportData>(`/reports/contracts${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/reports/clients */
  async clients(filters: ReportClientFilters = {}): Promise<ClientsReportData> {
    const params = new URLSearchParams();
    appendArrayParam(params, 'type',   filters.type);
    appendArrayParam(params, 'status', filters.status);
    const qs = params.toString();

    const raw = await apiClient.get<{
      clients: Array<Record<string, unknown>>;
      by_type: Array<{ type: number; count: number }>;
      by_status: Array<{ status: number; count: number }>;
    }>(`/reports/clients${qs ? `?${qs}` : ''}`);

    return {
      ...raw,
      clients: raw.clients.map(c => ({
        id: String(c.id),
        full_name: String(c.full_name ?? ''),
        phone: String(c.phone ?? ''),
        type: String(c.type ?? ''),
        status: String(c.status ?? ''),
        requests_count: Number(c.requests_count ?? 0),
        rental_contracts_count: Number(c.rental_contracts_count ?? 0),
        sale_contracts_count: Number(c.sale_contracts_count ?? 0),
        collections_count: Number(c.collections_count ?? 0),
        created_at: String(c.created_at ?? '').slice(0, 10),
      })),
    };
  },
};
