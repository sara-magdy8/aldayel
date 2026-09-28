import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { lookupsService, Lookups, LookupRow, ScopedLookupRow, EMPTY_LOOKUPS } from '@/services/lookups';

/** The two lists التصنيفات والنشاط are split into, addressed the way each page names it. */
export type ListingScope = 'إيجار' | 'بيع' | 'شراء';

/** A شراء request draws on the sale list, an إيجار one on the rental list. */
const inScope = (row: ScopedLookupRow, scope: ListingScope) =>
  scope === 'إيجار' ? row.for_rental : row.for_sale;

/** Fixed area (م²) filter slider bounds; the selected range is edited per-page. */
export const DEFAULT_AREA_BOUNDS = { min: 0, max: 1000 } as const;

interface AreaBounds { min: number; max: number }

interface LookupsContextValue extends Lookups {
  loading: boolean;
  /** Area (م²) filter slider bounds. */
  areaBounds: AreaBounds;
  /** Property statuses valid for a given listing type (rental excludes مباع, sale excludes مؤجر). */
  propertyStatusesFor: (listingType: 'إيجار' | 'بيع') => string[];
  /** Contract statuses valid per contract kind (rental excludes مكتمل, sale excludes منتهي). */
  contractStatusesFor: (kind: 'rental' | 'sale') => string[];
  /** Payment methods valid per context (collections vs contracts share one lookup table). */
  paymentMethodsFor: (context: 'collection' | 'contract') => string[];
  /** التصنيفات for one side — rental and sale keep separate lists. */
  propertyCatsFor: (scope: ListingScope) => string[];
  /** النشاط for one side (see propertyCatsFor). */
  activitiesFor: (scope: ListingScope) => string[];
  /** النشاط for one side as {id, name} — for the filters that query by activity_id. */
  activityOptionsFor: (scope: ListingScope) => LookupRow[];
}

const LookupsContext = createContext<LookupsContextValue>({
  ...EMPTY_LOOKUPS,
  loading: true,
  areaBounds: { ...DEFAULT_AREA_BOUNDS },
  propertyStatusesFor: () => [],
  contractStatusesFor: () => [],
  paymentMethodsFor: () => [],
  propertyCatsFor: () => [],
  activitiesFor: () => [],
  activityOptionsFor: () => [],
});

export const useLookups = () => useContext(LookupsContext);

// Allow-lists scoping the shared payment_types lookup to each context's valid set.
const COLLECTION_METHODS = ['نقدي', 'شيك', 'تحويل بنكي', 'بطاقة ائتمان'];
const CONTRACT_METHODS = ['نقدي', 'تقسيط بنكي', 'تقسيط مباشر'];

export const LookupsProvider = ({ children }: { children: ReactNode }) => {
  const [lookups, setLookups] = useState<Lookups>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    lookupsService
      .all()
      .then((l) => { if (active) setLookups(l); })
      .catch(() => { /* leave empty lists; pages still render */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo<LookupsContextValue>(() => ({
    ...lookups,
    loading,
    areaBounds: { ...DEFAULT_AREA_BOUNDS },
    propertyStatusesFor: (listingType) =>
      lookups.propertyStatuses.filter((s) => s !== (listingType === 'بيع' ? 'مؤجر' : 'مباع')),
    contractStatusesFor: (kind) =>
      lookups.contractStatuses.filter((s) => s !== (kind === 'sale' ? 'منتهي' : 'مكتمل')),
    paymentMethodsFor: (context) =>
      lookups.paymentTypes.filter((p) =>
        (context === 'contract' ? CONTRACT_METHODS : COLLECTION_METHODS).includes(p),
      ),
    propertyCatsFor: (scope) =>
      lookups.propertyCatRows.filter((c) => inScope(c, scope)).map((c) => c.name),
    activitiesFor: (scope) =>
      lookups.activityRows.filter((a) => inScope(a, scope)).map((a) => a.name),
    activityOptionsFor: (scope) =>
      lookups.activityRows.filter((a) => inScope(a, scope)).map(({ id, name }) => ({ id, name })),
  }), [lookups, loading]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
};
