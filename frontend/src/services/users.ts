import { apiClient } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A role's slug — the stable key permission checks compare against, and what the
 * API expects back. Not a literal union: the set lives in the roles table, so a
 * role added there must not need a code change. 'admin' is the privileged one.
 */
export type UserRole = string;

/** الصلاحية — a row of the roles lookup table. */
export interface Role {
  id: string;
  slug: UserRole;
  /** Arabic label shown to the user (مدير / موظف). */
  name: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** The role's Arabic label, resolved by the backend from the roles table. */
  role_name?: string;
  is_active: boolean;
  created_at?: string;
}

export interface PaginatedUsers {
  data: AppUser[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface UserFilters {
  search?: string;
  role?: string;
  page?: number;
  /** Page size; backend default is 5 and it caps the value at 500. */
  per_page?: number;
}

export interface UserFormData {
  name: string;
  email: string;
  password?: string; // required on create, omitted/blank keeps the current one on edit
  role: UserRole;
  is_active: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQuery(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.search)                          params.set('search', filters.search);
  if (filters.role && filters.role !== 'الكل') params.set('role',   filters.role);
  if (filters.page && filters.page > 1)        params.set('page',   String(filters.page));
  if (filters.per_page != null)                params.set('per_page', String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Coerce backend types to the TS shape (id → string, is_active → boolean). */
function normaliseUser(raw: Record<string, unknown>): AppUser {
  return {
    id:         String(raw.id),
    name:       String(raw.name ?? ''),
    email:      String(raw.email ?? ''),
    role:       (raw.role as UserRole) ?? 'staff',
    role_name:  raw.role_name ? String(raw.role_name) : undefined,
    is_active:  Boolean(raw.is_active),
    created_at: raw.created_at ? String(raw.created_at) : undefined,
  };
}

// ── Service ────────────────────────────────────────────────────────────────

export const usersService = {
  /**
   * GET /api/lookups/roles
   * The الصلاحية options, straight from the roles table — the form and the filter
   * both build themselves from this rather than from a hard-coded list.
   */
  async roles(): Promise<Role[]> {
    const raw = await apiClient.get<{ id: number; slug: string; name: string }[]>('/lookups/roles');
    return raw.map(r => ({ id: String(r.id), slug: r.slug, name: r.name }));
  },

  /** GET /api/users */
  async list(filters: UserFilters = {}): Promise<PaginatedUsers> {
    const raw = await apiClient.get<{ data: Record<string, unknown>[]; current_page: number; last_page: number; total: number; per_page: number }>(
      `/users${buildQuery(filters)}`,
    );
    return { ...raw, data: raw.data.map(normaliseUser) };
  },

  /** POST /api/users */
  async create(data: UserFormData): Promise<AppUser> {
    const raw = await apiClient.post<Record<string, unknown>>('/users', data);
    return normaliseUser(raw);
  },

  /** PUT /api/users/{id} */
  async update(id: string, data: Partial<UserFormData>): Promise<AppUser> {
    const raw = await apiClient.put<Record<string, unknown>>(`/users/${id}`, data);
    return normaliseUser(raw);
  },

  /** DELETE /api/users/{id} */
  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/users/${id}`);
  },
};
