export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

/**
 * Build a full URL for a file stored on the backend's public disk.
 * GET /api/settings returns raw paths (e.g. "office/abc.webp"); this resolves
 * them against the backend origin (API_BASE_URL minus its trailing "/api").
 * Absolute URLs (already containing http) are returned unchanged.
 */
export function storageUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${origin}/storage/${path.replace(/^\/+/, '')}`;
}

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'خطأ في الخادم' }));
    const err: ApiError = {
      status: res.status,
      message: body.message ?? 'خطأ في الخادم',
      errors: body.errors,
    };
    // Session expired / invalid token → clear and bounce to login.
    // Skip on the login request itself so its 422 surfaces as a field error.
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    throw err;
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined ?? {}),
    },
  });

  return handleResponse<T>(res, path);
}

/**
 * Multipart request for file uploads. Intentionally does NOT set Content-Type —
 * the browser adds it (with the multipart boundary) from the FormData body.
 */
async function requestForm<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    body: formData,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return handleResponse<T>(res, path);
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, formData),
};
