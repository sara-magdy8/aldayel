import { apiClient } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

/** Shape returned by GET /api/settings (key → value flat object). */
export interface OfficeSettings {
  office_name?: string;
  /** Short blurb used as the link-preview description when the URL is shared. */
  office_description?: string;
  office_phone?: string;
  office_email?: string;
  office_address?: string;
  office_logo?: string;
  /** Browser-tab icon; falls back to office_logo when unset. */
  office_favicon?: string;
}

export interface OfficeSettingsPayload {
  office_name?: string;
  office_description?: string;
  office_phone?: string;
  office_email?: string;
  office_address?: string;
}

export interface LogoUploadResponse {
  logo_url: string;
}

export interface FaviconUploadResponse {
  favicon_url: string;
}

/** Public branding for the login screen (office_logo is a full URL or null). */
export interface PublicBranding {
  office_name: string | null;
  office_description: string | null;
  office_logo: string | null;
  /** Logo inlined as a base64 data URI — safe for PDF/canvas rendering. */
  office_logo_data: string | null;
  /** Tab icon (full URL), or null when the office hasn't uploaded one. */
  office_favicon: string | null;
}

/**
 * Rental-contract expiry reminders. `rental_expiry_alert_days` holds one entry
 * per reminder — the number of days before expiry it fires — and always has
 * exactly `rental_expiry_alert_count` entries.
 */
export interface NotificationSettings {
  rental_expiry_alert_count: number;
  rental_expiry_alert_days: number[];
  /** Whether the tenant is also told once the lease has actually run out. */
  rental_ended_alert_enabled: boolean;
}

/**
 * Which of the two lists an entry belongs to. عقارات الإيجار and عقارات البيع keep
 * separate التصنيفات والنشاط; a name may sit in one or in both.
 */
export type LookupScope = 'إيجار' | 'بيع';

/** A property-category lookup row, with the list(s) it appears in. */
export interface PropertyCat {
  id: number;
  name: string;
  for_rental: boolean;
  for_sale: boolean;
}

/** A payment-type lookup row. */
export interface PaymentType {
  id: number;
  name: string;
}

/** A payment-term lookup row. */
export interface PaymentTerm {
  id: number;
  name: string;
}

/** An activity lookup row, with the list(s) it appears in (see PropertyCat). */
export interface Activity {
  id: number;
  name: string;
  for_rental: boolean;
  for_sale: boolean;
}

/** A building-status lookup row (حالة البناء). */
export interface BuildingStatus {
  id: number;
  name: string;
}

/** A "filmed by" lookup row. */
export interface FilmedBy {
  id: number;
  name: string;
}

/** Supported payment providers. Only Hesabe is wired up for now. */
export type PaymentProvider = 'hesabe';

/**
 * Provider-specific credentials, stored as a JSON blob server-side because the
 * field set differs per gateway (Hesabe: merchant_code, access_code,
 * secret_key, iv_key). Keys unknown to the selected gateway are dropped on save.
 */
export type GatewayCredentials = Record<string, string>;

/** A saved payment-gateway account. */
export interface PaymentGateway {
  id: number;
  name: string;
  gateway: PaymentProvider;
  credentials: GatewayCredentials | null;
}

/**
 * A gateway account as a pickable option. Deliberately credential-free — screens
 * that only need to *choose* an account must never receive the secret keys.
 */
export interface PaymentGatewayOption {
  id: number;
  name: string;
  gateway: PaymentProvider;
}

/** One account as sent to the sync endpoint (`id: null` ⇒ create). */
export interface PaymentGatewayPayload {
  id: number | null;
  name: string;
  gateway: PaymentProvider;
  credentials: GatewayCredentials;
}

// ── Service ────────────────────────────────────────────────────────────────

export const settingsService = {
  /** Load all office settings. GET /api/settings */
  load(): Promise<OfficeSettings> {
    return apiClient.get<OfficeSettings>('/settings');
  },

  /** Persist office info fields. POST /api/settings */
  save(data: OfficeSettingsPayload): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/settings', data);
  },

  /** Upload office logo and get back the public URL. POST /api/settings/logo */
  uploadLogo(file: File): Promise<LogoUploadResponse> {
    const form = new FormData();
    form.append('logo', file);
    return apiClient.postForm<LogoUploadResponse>('/settings/logo', form);
  },

  /** Upload the browser-tab icon and get back its public URL. POST /api/settings/favicon */
  uploadFavicon(file: File): Promise<FaviconUploadResponse> {
    const form = new FormData();
    form.append('favicon', file);
    return apiClient.postForm<FaviconUploadResponse>('/settings/favicon', form);
  },

  /** Public office branding for the login screen (no auth). GET /api/public/branding */
  branding(): Promise<PublicBranding> {
    return apiClient.get<PublicBranding>('/public/branding');
  },

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Load the expiry-reminder settings. GET /api/settings/notifications */
  loadNotifications(): Promise<NotificationSettings> {
    return apiClient.get<NotificationSettings>('/settings/notifications');
  },

  /** Save the expiry-reminder settings and get the stored result back. */
  saveNotifications(data: NotificationSettings): Promise<NotificationSettings> {
    return apiClient.post<NotificationSettings>('/settings/notifications', data);
  },

  // ── Payment gateways ──────────────────────────────────────────────────────

  /** List saved gateway accounts. GET /api/settings/payment-gateways */
  listPaymentGateways(): Promise<PaymentGateway[]> {
    return apiClient.get<PaymentGateway[]>('/settings/payment-gateways');
  },

  /**
   * Gateway accounts for a picker, without credentials.
   * GET /api/lookups/payment-gateways
   */
  listPaymentGatewayOptions(): Promise<PaymentGatewayOption[]> {
    return apiClient.get<PaymentGatewayOption[]>('/lookups/payment-gateways');
  },

  /**
   * Replace the stored gateway accounts with `accounts` and return the saved
   * list. POST /api/settings/payment-gateways — anything omitted is deleted.
   */
  savePaymentGateways(accounts: PaymentGatewayPayload[]): Promise<PaymentGateway[]> {
    return apiClient.post<PaymentGateway[]>('/settings/payment-gateways', { accounts });
  },

  // ── Property categories CRUD ──────────────────────────────────────────────

  /**
   * List property categories. GET /api/lookups/property-cats
   * Both lists come back at once, each row carrying the sides it appears in.
   */
  listPropertyCats(): Promise<PropertyCat[]> {
    return apiClient.get<PropertyCat[]>('/lookups/property-cats');
  },

  /**
   * Add a category to one side's list. POST /api/lookups/property-cats
   * A name already on the other side is added to this one, not duplicated.
   */
  createPropertyCat(name: string, listingType: LookupScope): Promise<PropertyCat> {
    return apiClient.post<PropertyCat>('/lookups/property-cats', { name, listing_type: listingType });
  },

  /**
   * Remove a category from one side's list. DELETE /api/lookups/property-cats/{id}
   * The row survives while the other side still shows it.
   */
  deletePropertyCat(id: number, listingType: LookupScope): Promise<void> {
    return apiClient.delete<void>(`/lookups/property-cats/${id}?listing_type=${encodeURIComponent(listingType)}`);
  },

  // ── Payment types CRUD ────────────────────────────────────────────────────

  /** List payment types. GET /api/lookups/payment-types */
  listPaymentTypes(): Promise<PaymentType[]> {
    return apiClient.get<PaymentType[]>('/lookups/payment-types');
  },

  /** Create a payment type. POST /api/lookups/payment-types */
  createPaymentType(name: string): Promise<PaymentType> {
    return apiClient.post<PaymentType>('/lookups/payment-types', { name });
  },

  /** Delete a payment type. DELETE /api/lookups/payment-types/{id} */
  deletePaymentType(id: number): Promise<void> {
    return apiClient.delete<void>(`/lookups/payment-types/${id}`);
  },

  // ── Payment terms CRUD ────────────────────────────────────────────────────

  /** List payment terms. GET /api/lookups/payment-terms */
  listPaymentTerms(): Promise<PaymentTerm[]> {
    return apiClient.get<PaymentTerm[]>('/lookups/payment-terms');
  },

  /** Create a payment term. POST /api/lookups/payment-terms */
  createPaymentTerm(name: string): Promise<PaymentTerm> {
    return apiClient.post<PaymentTerm>('/lookups/payment-terms', { name });
  },

  /** Delete a payment term. DELETE /api/lookups/payment-terms/{id} */
  deletePaymentTerm(id: number): Promise<void> {
    return apiClient.delete<void>(`/lookups/payment-terms/${id}`);
  },

  // ── Activities CRUD ───────────────────────────────────────────────────────

  /** List activities, both lists at once. GET /api/lookups/activities */
  listActivities(): Promise<Activity[]> {
    return apiClient.get<Activity[]>('/lookups/activities');
  },

  /** Add an activity to one side's list. POST /api/lookups/activities */
  createActivity(name: string, listingType: LookupScope): Promise<Activity> {
    return apiClient.post<Activity>('/lookups/activities', { name, listing_type: listingType });
  },

  /** Remove an activity from one side's list. DELETE /api/lookups/activities/{id} */
  deleteActivity(id: number, listingType: LookupScope): Promise<void> {
    return apiClient.delete<void>(`/lookups/activities/${id}?listing_type=${encodeURIComponent(listingType)}`);
  },

  // ── Filmed by CRUD ────────────────────────────────────────────────────────

  /** List "filmed by" entries. GET /api/lookups/filmed-by */
  listFilmedBy(): Promise<FilmedBy[]> {
    return apiClient.get<FilmedBy[]>('/lookups/filmed-by');
  },

  /** Create a "filmed by" entry. POST /api/lookups/filmed-by */
  createFilmedBy(name: string): Promise<FilmedBy> {
    return apiClient.post<FilmedBy>('/lookups/filmed-by', { name });
  },

  /** Delete a "filmed by" entry. DELETE /api/lookups/filmed-by/{id} */
  deleteFilmedBy(id: number): Promise<void> {
    return apiClient.delete<void>(`/lookups/filmed-by/${id}`);
  },

  // ── Building statuses CRUD ────────────────────────────────────────────────

  /** List building statuses. GET /api/lookups/building-statuses */
  listBuildingStatuses(): Promise<BuildingStatus[]> {
    return apiClient.get<BuildingStatus[]>('/lookups/building-statuses');
  },

  /** Create a building status. POST /api/lookups/building-statuses */
  createBuildingStatus(name: string): Promise<BuildingStatus> {
    return apiClient.post<BuildingStatus>('/lookups/building-statuses', { name });
  },

  /** Delete a building status. DELETE /api/lookups/building-statuses/{id} */
  deleteBuildingStatus(id: number): Promise<void> {
    return apiClient.delete<void>(`/lookups/building-statuses/${id}`);
  },
};
