import { apiClient } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DashboardCards {
  properties: { total: number };
  units: { total: number };
  requests: { open: number };
  contracts: {
    active: number;
    rental: number;
    sale: number;
  };
  today_collections: number;
  month_collections: number;
}

export interface MonthlyCollection {
  month: string;
  amount: number;
}

/** A single { lookup name, count } slice used by the status cards and the pie chart. */
export interface StatusSlice {
  name: string;
  value: number;
}

export interface RecentRequest {
  client: string;
  type: string;
  category: string;
  status: string;
  date: string;
}

export interface RecentCollection {
  client: string;
  amount: number;
  type: string;
  method: string;
  date: string;
}

export interface DashboardData {
  cards: DashboardCards;
  monthly_collections: MonthlyCollection[];
  properties_status: StatusSlice[];
  units_status: StatusSlice[];
  requests_status: StatusSlice[];
  recent_requests: RecentRequest[];
  recent_collections: RecentCollection[];
}

// ── Service ────────────────────────────────────────────────────────────────

export const dashboardService = {
  get(): Promise<DashboardData> {
    return apiClient.get<DashboardData>('/dashboard');
  },
};
