import { apiClient } from './api';
import { appendArrayParam } from '@/lib/query';
import { Client, ClientType, Collection } from '@/types';
import { normaliseCollection, RawCollection } from './collections';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaginatedClients {
  data: Client[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface ClientFilters {
  search?: string;
  type?: string[];
  status?: string[];
  /** الصفة — 'مالك' / 'مشتري' / 'مستأجر', derived from what the client is attached to. */
  role?: string[];
  page?: number;
  /** Page size; backend default is 5 and it caps the value at 500. */
  per_page?: number;
}

/**
 * The slim client shape returned by GET /clients/options. `type` is carried
 * because the rental contract form shows company-only document slots for شركة.
 * A structural subset of `Client`, so a full record can be used in its place.
 */
export interface ClientOption {
  id: string;
  full_name: string;
  phone: string;
  type: ClientType;
}

export interface ClientOptionFilters {
  search?: string;
  type?: string[];
  /** Force this client into the result even when it falls outside the cap. */
  include?: string;
  /** Max search results (default 50, capped at 100). 0 returns only `include`. */
  limit?: number;
}

export interface ClientStats {
  total: number;
  individuals: number;
  companies: number;
  brokers: number;
  property_managers: number;
}

export type ClientFormData = Omit<Client, 'id' | 'created_at'>;

export interface ClientWithRelations extends Client {
  owned_properties: Record<string, unknown>[];
  requests: Record<string, unknown>[];
  rental_contracts: Record<string, unknown>[];
  sale_contracts: Record<string, unknown>[];
  collections: Collection[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQuery(filters: ClientFilters): string {
  const params = new URLSearchParams();
  if (filters.search)                           params.set('search', filters.search);
  appendArrayParam(params, 'type',   filters.type);
  appendArrayParam(params, 'status', filters.status);
  appendArrayParam(params, 'role',   filters.role);
  if (filters.page   && filters.page   > 1)    params.set('page',   String(filters.page));
  if (filters.per_page != null)                params.set('per_page', String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Ensure model IDs are always strings so they match the TypeScript type. */
function normaliseClient(raw: Record<string, unknown>): Client {
  return { ...(raw as unknown as Client), id: String(raw.id) };
}

// ── Service ────────────────────────────────────────────────────────────────

export const clientsService = {
  async list(filters: ClientFilters = {}): Promise<PaginatedClients> {
    const raw = await apiClient.get<{ data: Record<string, unknown>[]; current_page: number; last_page: number; total: number; per_page: number }>(
      `/clients${buildQuery(filters)}`,
    );
    return { ...raw, data: raw.data.map(normaliseClient) };
  },

  /**
   * GET /api/clients/options
   * Backend-searched dropdown options. Prefer this over `list()` for any select:
   * it is capped server-side and skips the list view's role subqueries.
   */
  async options(filters: ClientOptionFilters = {}): Promise<ClientOption[]> {
    const params = new URLSearchParams();
    if (filters.search)  params.set('search', filters.search);
    appendArrayParam(params, 'type', filters.type);
    if (filters.include) params.set('include', filters.include);
    if (filters.limit != null) params.set('limit', String(filters.limit));
    const qs = params.toString();

    const raw = await apiClient.get<(Omit<ClientOption, 'id'> & { id: number })[]>(
      `/clients/options${qs ? `?${qs}` : ''}`,
    );
    return raw.map(o => ({ ...o, id: String(o.id) }));
  },

  stats(): Promise<ClientStats> {
    return apiClient.get<ClientStats>('/clients/stats');
  },

  async show(id: string): Promise<ClientWithRelations> {
    const raw = await apiClient.get<Record<string, unknown>>(`/clients/${id}`);
    const details = { ...(normaliseClient(raw) as Client), ...raw } as ClientWithRelations;
    // Collections arrive raw (nested `property`, string amount, ISO dates) — flatten
    // them through the collections normaliser so they match the `Collection` type.
    details.collections = ((raw.collections as RawCollection[]) ?? []).map(normaliseCollection);
    return details;
  },

  async create(data: ClientFormData): Promise<Client> {
    const raw = await apiClient.post<Record<string, unknown>>('/clients', data);
    return normaliseClient(raw);
  },

  async update(id: string, data: Partial<ClientFormData>): Promise<Client> {
    const raw = await apiClient.put<Record<string, unknown>>(`/clients/${id}`, data);
    return normaliseClient(raw);
  },

  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/clients/${id}`);
  },
};
