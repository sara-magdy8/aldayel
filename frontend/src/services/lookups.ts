import { apiClient } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

/** A single lookup row as returned by /api/lookups/*. */
export interface LookupRow {
  id: number;
  name: string;
}

/** An area (district) row — carries the governorate it belongs to for cascading. */
export interface AreaRow {
  id: number;
  name: string;
  governorate_id: number;
}

/**
 * التصنيفات والنشاط are kept as two lists — one for الإيجار and one for البيع. The
 * backend serves the rows once with a flag per side rather than a list per side,
 * so an entry offered to both is still one row with one id.
 */
export interface ScopedLookupRow extends LookupRow {
  for_rental: boolean;
  for_sale: boolean;
}

/** All lookup option lists, each exposed as an array of Arabic names. */
export interface Lookups {
  collectionTypes: string[];
  paymentTypes: string[];
  paymentTerms: string[];
  paymentBeneficiaries: string[];
  /** Every category name, both lists merged — for views that span listing types. */
  propertyCats: string[];
  propertyStatuses: string[];
  requestStatuses: string[];
  contractStatuses: string[];
  /** Every activity name, both lists merged (see propertyCats). */
  activities: string[];
  /** Activities as {id, name} pairs — used where filtering happens by activity_id. */
  activityOptions: LookupRow[];
  /** Category rows with their per-listing-type flags; use propertyCatsFor() to read them. */
  propertyCatRows: ScopedLookupRow[];
  /** Activity rows with their per-listing-type flags; use activitiesFor() to read them. */
  activityRows: ScopedLookupRow[];
  /** "Filmed by" options (تم التصوير من قبل) — Arabic names. */
  filmedBy: string[];
  /** حالة البناء options — عقارات البيع only. */
  buildingStatuses: string[];
  /** Governorates (المحافظات) as {id, name} pairs. */
  governorates: LookupRow[];
  /** Areas/districts (المناطق) as {id, name, governorate_id} — filtered by governorate in the UI. */
  areas: AreaRow[];
}

export const EMPTY_LOOKUPS: Lookups = {
  collectionTypes: [],
  paymentTypes: [],
  paymentTerms: [],
  paymentBeneficiaries: [],
  propertyCats: [],
  propertyStatuses: [],
  requestStatuses: [],
  contractStatuses: [],
  activities: [],
  activityOptions: [],
  propertyCatRows: [],
  activityRows: [],
  filmedBy: [],
  buildingStatuses: [],
  governorates: [],
  areas: [],
};

// ── Service ────────────────────────────────────────────────────────────────

const names = (rows: LookupRow[]): string[] => rows.map((r) => r.name);

export const lookupsService = {
  /** Fetch every lookup list in parallel and flatten each to its names. */
  async all(): Promise<Lookups> {
    const [
      collectionTypes,
      paymentTypes,
      paymentTerms,
      paymentBeneficiaries,
      propertyCats,
      propertyStatuses,
      requestStatuses,
      contractStatuses,
      activities,
      filmedBy,
      buildingStatuses,
      governorates,
      areas,
    ] = await Promise.all([
      apiClient.get<LookupRow[]>('/lookups/collection-types'),
      apiClient.get<LookupRow[]>('/lookups/payment-types'),
      apiClient.get<LookupRow[]>('/lookups/payment-terms'),
      apiClient.get<LookupRow[]>('/lookups/payment-beneficiaries'),
      apiClient.get<ScopedLookupRow[]>('/lookups/property-cats'),
      apiClient.get<LookupRow[]>('/lookups/property-statuses'),
      apiClient.get<LookupRow[]>('/lookups/request-statuses'),
      apiClient.get<LookupRow[]>('/lookups/contract-statuses'),
      apiClient.get<ScopedLookupRow[]>('/lookups/activities'),
      apiClient.get<LookupRow[]>('/lookups/filmed-by'),
      apiClient.get<LookupRow[]>('/lookups/building-statuses'),
      apiClient.get<LookupRow[]>('/lookups/governorates'),
      apiClient.get<AreaRow[]>('/lookups/areas'),
    ]);

    return {
      collectionTypes: names(collectionTypes),
      paymentTypes: names(paymentTypes),
      paymentTerms: names(paymentTerms),
      paymentBeneficiaries: names(paymentBeneficiaries),
      propertyCats: names(propertyCats),
      propertyStatuses: names(propertyStatuses),
      requestStatuses: names(requestStatuses),
      contractStatuses: names(contractStatuses),
      activities: names(activities),
      activityOptions: activities,
      propertyCatRows: propertyCats,
      activityRows: activities,
      filmedBy: names(filmedBy),
      buildingStatuses: names(buildingStatuses),
      governorates,
      areas,
    };
  },
};
