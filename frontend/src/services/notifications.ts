import { apiClient } from './api';
import { appendArrayParam } from '@/lib/query';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Which alert a notification came from. Mirrors NotificationFeed::TYPES on the
 * backend — the feed is a union of the three ledgers the mailing commands write,
 * so these are the only kinds that can ever appear.
 */
export type NotificationType = 'match' | 'contract_expiry' | 'payment_link';

export const NOTIFICATION_TYPES: NotificationType[] = ['match', 'contract_expiry', 'payment_link'];

/** Arabic labels for the type filter and the row badges. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  match: 'مطابقة عقار',
  contract_expiry: 'انتهاء عقد إيجار',
  payment_link: 'انتهاء رابط سداد',
};

/** Type-specific extras the row renders beside its text. */
export interface NotificationMeta {
  // match
  property_id?: number | null;
  property_code?: string | null;
  property_name?: string | null;
  request_id?: number | null;
  request_type?: string | null;
  client_name?: string | null;
  // contract_expiry
  contract_id?: number | null;
  contract_number?: string | null;
  tenant_name?: string | null;
  end_date?: string | null;
  days_before?: number | null;
  /** True for the closing notice (days_before = 0), sent once the lease ran out. */
  ended?: boolean;
  // payment_link
  collection_id?: number | null;
  collection_number?: string | null;
  amount?: number | null;
  expires_at?: string | null;
  payment_status?: string | null;
  reminder_days?: number | null;
  /** Whether the client has since paid — a reminder that worked. */
  paid?: boolean;
}

export interface AppNotification {
  /** Composite `"{type}-{source_id}"` — unique across the three sources. */
  id: string;
  type: NotificationType;
  /** The row's id within its own ledger; the pair identifies it when marking read. */
  source_id: number;
  /** ISO-8601 instant the mail was sent. */
  occurred_at: string;
  /** Sent at or before this user's last visit to the feed. */
  read: boolean;
  title: string;
  body: string;
  /**
   * Who the mail went to — an address, or a role for the office-wide digests.
   * Null when the client's address has been removed since it was sent.
   */
  recipient: string | null;
  /** In-app route the notification is about, for the "عرض" action. */
  link: string | null;
  meta: NotificationMeta;
}

export interface NotificationFilters {
  types?: NotificationType[];
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  /** Page size; backend default is 20 and it caps the value at 500. */
  per_page?: number;
}

export interface PaginatedNotifications {
  data: AppNotification[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
  /** Unread across the whole feed, not just this page — drives the sidebar badge. */
  unread_count: number;
  /**
   * The visit these rows were judged against — anything newer is new to the
   * user. Null before their first visit. The page freezes the first one it sees
   * so its highlights survive paging, which the per-row `read` flag cannot: by
   * the second request the visit has already moved the watermark past them.
   */
  read_before: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQuery(filters: NotificationFilters): string {
  const params = new URLSearchParams();
  appendArrayParam(params, 'types', filters.types);
  if (filters.search)                   params.set('search', filters.search);
  if (filters.date_from)                params.set('date_from', filters.date_from);
  if (filters.date_to)                  params.set('date_to', filters.date_to);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.per_page != null)         params.set('per_page', String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ── Service ────────────────────────────────────────────────────────────────

export const notificationsService = {
  /** GET /api/notifications — one page of the feed plus the unread total. */
  list(filters: NotificationFilters = {}): Promise<PaginatedNotifications> {
    return apiClient.get<PaginatedNotifications>(`/notifications${buildQuery(filters)}`);
  },

  /** GET /api/notifications/unread-count — just the badge. */
  unreadCount(): Promise<{ unread_count: number }> {
    return apiClient.get<{ unread_count: number }>('/notifications/unread-count');
  },

  /**
   * POST /api/notifications/seen — record that the user has opened the feed,
   * which is what marks everything in it read. Posted by the page on open;
   * there is no per-notification read state to mark, and nothing to undo.
   */
  markSeen(): Promise<{ unread_count: number; message: string }> {
    return apiClient.post<{ unread_count: number; message: string }>('/notifications/seen', {});
  },
};
