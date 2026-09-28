import { apiClient } from './api';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export interface ProfileUpdatePayload {
  name: string;
  email: string;
  /** Required only when changing the password. */
  current_password?: string;
  password?: string;
  password_confirmation?: string;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'auth_user';

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    return res;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // Ignore — clear local session regardless of server response
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  me(): Promise<AuthUser> {
    return apiClient.get<AuthUser>('/auth/me');
  },

  /** Update the logged-in user's own profile and refresh the cached copy. */
  async updateProfile(data: ProfileUpdatePayload): Promise<AuthUser> {
    const user = await apiClient.put<AuthUser>('/auth/profile', data);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
