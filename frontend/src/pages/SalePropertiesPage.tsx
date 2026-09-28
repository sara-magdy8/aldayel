import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Eye, Pencil, Link2, Trash2, Layers, FileDown, Loader2, ClipboardList, Tag } from 'lucide-react';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import DataTablePagination, { DEFAULT_PER_PAGE } from '@/components/DataTablePagination';
import { PropertyListState, readPropertyListState } from '@/lib/propertyListState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import { AsyncSearchableSelect } from '@/components/ui/async-searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Property, ClientRequest } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { formatDate, formatDateTime } from '@/lib/utils';
import { downloadPropertyPdf } from '@/lib/propertyPdf';
import { propertiesService, PropertyFormData, PropertySort, SoumFilter } from '@/services/properties';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { requestsService } from '@/services/requests';
import { clientsService, ClientOption } from '@/services/clients';
import { MatchOptions } from '@/lib/query';
import MatchCriteriaFields, { DEFAULT_MATCH_OPTIONS } from '@/components/MatchCriteriaFields';
import PropertyFormDrawer from '@/components/PropertyFormDrawer';
import PropertyViewDrawer from '@/components/PropertyViewDrawer';
import PropertySoumsDialog from '@/components/PropertySoumsDialog';
import { Label } from '@/components/ui/label';

const statusColors: Record<string, string> = {
  'متاح': 'bg-green-100 text-green-800',
  'محجوز': 'bg-amber-100 text-amber-800',
  'مباع': 'bg-gray-100 text-gray-800',
};

// Area input step (م²). Filtering by area uses two free-text number inputs
// (from / to); an empty input means "unbounded" on that side.
const AREA_STEP = 10;

// السوم filter. 'all' is the unset state and is never sent to the backend.
const SOUM_OPTIONS: { value: SoumFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'with', label: 'يوجد سوم' },
  { value: 'without', label: 'لا يوجد سوم' },
];

// Ordering options for the list. `newest` is the backend default.
const SORT_OPTIONS: { value: PropertySort; label: string }[] = [
  { value: 'newest', label: 'من الأحدث' },
  { value: 'oldest', label: 'من الأقدم' },
  { value: 'code_asc', label: 'كود العقار تصاعدي' },
  { value: 'code_desc', label: 'كود العقار تنازلي' },
];

const SalePropertiesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Returning from the units page? Reopen on the page and filters we left.
  const restored = readPropertyListState(location.state);
  // Filter option lists from the backend lookup tables. التصنيف والنشاط are kept
  // as two lists; this page filters over عقارات البيع, so it shows that one.
  const { governorates, areas, buildingStatuses, propertyStatusesFor, propertyCatsFor, activitiesFor } = useLookups();
  const propertyCats = propertyCatsFor('بيع');
  const activities = activitiesFor('بيع');
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(restored?.page ?? 1);
  const [lastPage, setLastPage] = useState(1);
  // Total matching rows and page size, driving the datatable pagination bar.
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(restored?.perPage ?? DEFAULT_PER_PAGE);
  const [search, setSearch] = useState(restored?.search ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(restored?.search ?? '');
  const [statusFilter, setStatusFilter] = useState<string[]>(restored?.status ?? []);
  const [categoryFilter, setCategoryFilter] = useState<string[]>(restored?.category ?? []);
  const [typeFilter, setTypeFilter] = useState<string[]>(restored?.type ?? []);
  const [activityFilter, setActivityFilter] = useState<string[]>(restored?.activity ?? []);
  const [buildingStatusFilter, setBuildingStatusFilter] = useState<string[]>(restored?.buildingStatus ?? []);
  // Governorate/area filters hold lookup ids (as strings, matching MultiSearchableSelect).
  const [governorateFilter, setGovernorateFilter] = useState<string[]>(restored?.governorate ?? []);
  const [areaFilter, setAreaFilter] = useState<string[]>(restored?.area ?? []);
  // المالك — a single client id. The clients table can outgrow a dropdown, so the
  // options are searched server-side; the name is kept alongside because the
  // selected owner is usually not in the (capped) list the trigger renders from.
  const [ownerFilter, setOwnerFilter] = useState<string>(restored?.owner ?? '');
  const [ownerName, setOwnerName] = useState<string>(restored?.ownerName ?? '');
  // Area range filter (م²): raw input strings, debounced before they hit the query.
  // An empty string means that bound is unset.
  const [minArea, setMinArea] = useState(restored?.minArea ?? '');
  const [maxArea, setMaxArea] = useState(restored?.maxArea ?? '');
  // السوم — 'all' unless narrowed to listings that have bids, or that have none.
  const [soumFilter, setSoumFilter] = useState<SoumFilter>(restored?.soum ?? 'all');
  // الترتيب — newest-first unless the user picks another option.
  const [sort, setSort] = useState<PropertySort>(restored?.sort ?? 'newest');
  const [debouncedMinArea, setDebouncedMinArea] = useState(restored?.minArea ?? '');
  const [debouncedMaxArea, setDebouncedMaxArea] = useState(restored?.maxArea ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [viewProperty, setViewProperty] = useState<Property | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Id of the property whose PDF is currently being generated, so we can show
  // a spinner and block repeat clicks (PDF build is slow on the live server).
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Matching-requests dialog: the property whose matches we're showing, plus
  // the fetched rows and their loading state.
  const [matchProperty, setMatchProperty] = useState<Property | null>(null);
  const [matchRequests, setMatchRequests] = useState<ClientRequest[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  // معايير مطابقة اضافية — kept across openings so an agent doesn't re-pick
  // them for every property.
  const [matchOptions, setMatchOptions] = useState<MatchOptions>(DEFAULT_MATCH_OPTIONS);
  // السوم — the property whose bids dialog is open (null = closed).
  const [soumProperty, setSoumProperty] = useState<Property | null>(null);

  // Every "back to page 1" below must skip its first run: on mount nothing has
  // changed yet, and resetting would throw away a page restored from the units page.
  const searchReady = useRef(false);
  const areaReady = useRef(false);
  const filtersReady = useRef(false);

  // Debounce search — reset to page 1 on new search term
  useEffect(() => {
    if (!searchReady.current) { searchReady.current = true; return; }
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Debounce the area range inputs — reset to page 1 on change
  useEffect(() => {
    if (!areaReady.current) { areaReady.current = true; return; }
    const t = setTimeout(() => {
      setDebouncedMinArea(minArea);
      setDebouncedMaxArea(maxArea);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [minArea, maxArea]);

  // Reset to page 1 when dropdown filters change
  useEffect(() => {
    if (!filtersReady.current) { filtersReady.current = true; return; }
    setCurrentPage(1);
  }, [statusFilter, categoryFilter, typeFilter, activityFilter, buildingStatusFilter, governorateFilter, areaFilter, ownerFilter, soumFilter, sort]);

  // Changing the page size restarts from page 1 — batched with the size change
  // itself so the list refetches once, not twice.
  const handlePerPageChange = (n: number) => {
    setPerPage(n);
    setCurrentPage(1);
  };

  // Open the units page, handing it this list's page + filters so its back
  // button can bring the user straight back to where they were.
  const openUnits = (propertyId: string) => {
    const listState: PropertyListState = {
      page: currentPage, perPage, search, status: statusFilter, category: categoryFilter,
      type: typeFilter, activity: activityFilter, buildingStatus: buildingStatusFilter, governorate: governorateFilter,
      area: areaFilter, owner: ownerFilter, ownerName, minArea, maxArea, soum: soumFilter, sort,
    };
    navigate(`/properties/${propertyId}/units`, { state: listState });
  };

  // ── Filter reset ────────────────────────────────────────────────────────
  const hasActiveFilters =
    search !== '' || minArea !== '' || maxArea !== '' || sort !== 'newest' || ownerFilter !== '' || soumFilter !== 'all' ||
    [statusFilter, categoryFilter, typeFilter, activityFilter, buildingStatusFilter, governorateFilter, areaFilter].some(f => f.length > 0);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter([]);
    setCategoryFilter([]);
    setTypeFilter([]);
    setActivityFilter([]);
    setBuildingStatusFilter([]);
    setGovernorateFilter([]);
    setAreaFilter([]);
    setOwnerFilter('');
    setOwnerName('');
    setMinArea('');
    setMaxArea('');
    setSoumFilter('all');
    setSort('newest');
  };

  // المالك options, searched server-side and capped there. Not memoised:
  // AsyncSearchableSelect holds the fetcher in a ref, so a fresh closure per
  // render costs nothing and re-triggers nothing.
  const fetchOwners = (search: string) =>
    clientsService.options({ search: search || undefined, type: ['شركة', 'فرد'] });

  // Areas cascade from the selected governorates: with no governorate picked show
  // every area, otherwise only areas belonging to a selected governorate.
  const areaOptions = useMemo(() => {
    const govs = new Set(governorateFilter);
    const list = govs.size === 0 ? areas : areas.filter(a => govs.has(String(a.governorate_id)));
    return list.map(a => ({ value: String(a.id), label: a.name }));
  }, [areas, governorateFilter]);

  // Drop any selected area that no longer belongs to a chosen governorate.
  // Skipped while the lookups are still loading, otherwise an area restored from
  // the units page would be pruned against an empty list.
  useEffect(() => {
    if (governorateFilter.length === 0 || areas.length === 0) return;
    const allowed = new Set(areaOptions.map(o => o.value));
    setAreaFilter(prev => prev.filter(id => allowed.has(id)));
  }, [governorateFilter, areaOptions, areas]);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const result = await propertiesService.list({
        listing_type: 'بيع',
        search: debouncedSearch || undefined,
        status: statusFilter,
        category: categoryFilter,
        property_type: typeFilter,
        activity: activityFilter,
        building_status: buildingStatusFilter,
        governorate_id: governorateFilter,
        area_id: areaFilter,
        owner_id: ownerFilter ? [ownerFilter] : undefined,
        // 'all' means do not narrow, so the key stays out of the query entirely.
        has_soums: soumFilter === 'all' ? undefined : soumFilter === 'with',
        min_area: debouncedMinArea !== '' ? Number(debouncedMinArea) : undefined,
        max_area: debouncedMaxArea !== '' ? Number(debouncedMaxArea) : undefined,
        sort,
        page: currentPage,
        per_page: perPage,
      });
      setProperties(result.data);
      setLastPage(result.last_page);
      setTotal(result.total);
    } catch {
      toast.error('فشل تحميل العقارات');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, categoryFilter, typeFilter, activityFilter, buildingStatusFilter, governorateFilter, areaFilter, ownerFilter, soumFilter, debouncedMinArea, debouncedMaxArea, sort, currentPage, perPage]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handleSave = async (property: Property, attachments: File[]) => {
    const {
      listing_type, name, property_code, property_type, category, filmed_by, building_status, priority, activities, owner_id, plot_number,
      area, governorate_id, area_id, location_link, description, guard_name, guard_phone,
      broker_id, manager_id,
      forsale_link, instagram_link, whatsapp_link, marketing_status, commission,
      notes, status, rent_amount, price, conditions, grace_period,
      tenant_id, tenant_start, tenant_end, sale_date,
    } = property;
    const formData: PropertyFormData = {
      listing_type, name, property_code, property_type, category, filmed_by, priority, activities, owner_id, plot_number,
      // Explicit null so clearing حالة البناء reaches the backend (see broker_id below).
      building_status: building_status ?? null,
      area, governorate_id, area_id, location_link, description, guard_name, guard_phone,
      // Explicit null, not undefined: an omitted key would be absent from the
      // request body and leave the previously linked broker/manager in place.
      broker_id: broker_id ?? null,
      manager_id: manager_id ?? null,
      tenant_id: tenant_id ?? null,
      forsale_link, instagram_link, whatsapp_link, marketing_status, commission,
      notes, status, rent_amount, price, conditions, grace_period,
      tenant_start, tenant_end, sale_date,
    };
    try {
      if (editingProperty) {
        await propertiesService.update(editingProperty.id, formData, attachments);
        toast.success('تم تعديل العقار بنجاح');
      } else {
        await propertiesService.create(formData, attachments);
        toast.success('تم إضافة العقار بنجاح');
      }
      await fetchProperties();
      setFormOpen(false);
      setEditingProperty(null);
    } catch (err) {
      const message = (err as { message?: string })?.message;
      toast.error(message || 'فشل حفظ العقار');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await propertiesService.remove(deleteId);
      toast.success('تم حذف العقار');
      setDeleteId(null);
      await fetchProperties();
    } catch {
      toast.error('فشل حذف العقار');
    }
  };

  const handleCopyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/view/${token}`);
    toast.success('تم نسخ الرابط');
  };

  // Export a client-facing property detail sheet as a downloadable PDF. Fetch
  // the property's images as base64 first so they embed without CORS taint.
  const handleDownloadPdf = async (property: Property) => {
    if (downloadingId) return; // already generating a PDF; ignore repeat clicks
    setDownloadingId(property.id);
    try {
      let images: string[] = [];
      try {
        images = await propertiesService.getImageDataUrls(property.id);
      } catch {
        // Non-critical: generate a text-only sheet if images fail to load.
      }
      await downloadPropertyPdf(property, { images });
    } catch {
      toast.error('تعذّر إنشاء ملف PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  // Show client requests that match an available property (same category,
  // activity, and area, sale type, not completed).
  const handleShowMatches = (property: Property) => {
    setMatchProperty(property);
    setMatchRequests([]);
  };

  // The matching criteria are part of the query, so the list refetches whenever
  // they change while the dialog is open. Debounced so dragging a slider issues
  // one request on release rather than one per step.
  useEffect(() => {
    if (!matchProperty) return;
    let cancelled = false;
    setMatchLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await requestsService.matchingForProperty(matchProperty.id, matchOptions);
        if (!cancelled) setMatchRequests(rows);
      } catch {
        if (!cancelled) {
          setMatchRequests([]);
          toast.error('تعذّر تحميل الطلبات المطابقة');
        }
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [matchProperty, matchOptions]);

  const handleUpdateProperty = async (updated: Property) => {
    const prev = viewProperty;
    if (!prev) return;
    try {
      let result = updated;

      // Toggle public link on/off
      if (updated.public_link_enabled !== prev.public_link_enabled) {
        const r = await propertiesService.toggleLink(updated.id);
        result = { ...result, public_link_enabled: r.public_link_enabled };
        toast.success(r.public_link_enabled ? 'تم تفعيل الرابط' : 'تم إلغاء تفعيل الرابط');
      }

      // Update link visibility settings
      if (
        updated.public_show_price !== prev.public_show_price ||
        updated.public_show_location !== prev.public_show_location ||
        updated.public_show_contact !== prev.public_show_contact
      ) {
        result = await propertiesService.linkSettings(updated.id, {
          public_show_price: updated.public_show_price,
          public_show_location: updated.public_show_location,
          public_show_contact: updated.public_show_contact,
        });
        toast.success('تم تحديث إعدادات العرض');
      }

      setProperties(ps => ps.map(p => p.id === result.id ? result : p));
      setViewProperty(result);
    } catch {
      toast.error('فشل تحديث الإعدادات');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">عقارات البيع</h2>
        <Button onClick={() => { setEditingProperty(null); setFormOpen(true); }} className="gap-2 w-full sm:w-auto">
          <Plus size={18} />
          إضافة عقار بيع
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="role-filter">بحث</Label>
          <Input placeholder="بحث بالكود او الاسم او العنوان..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
        </div>

        <div className="w-full md:w-52 space-y-1.5">
          <Label>المالك</Label>
          {/* Backend-searched — the client table can outgrow any dropdown. */}
          <AsyncSearchableSelect
            className="w-full md:w-52"
            value={ownerFilter}
            onSelect={(c: ClientOption) => { setOwnerFilter(c.id); setOwnerName(c.full_name); }}
            fetchOptions={fetchOwners}
            optionValue={c => c.id}
            optionLabel={c => c.full_name}
            // The picked owner is not necessarily in the capped result page.
            selectedLabel={ownerName}
            onClear={() => { setOwnerFilter(''); setOwnerName(''); }}
            clearLabel="الكل"
            placeholder="الكل"
            searchPlaceholder="ابحث باسم المالك..."
            emptyText="لا يوجد مالك مطابق"
          />
        </div>

        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="role-filter">الحالة</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="الحالة"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={propertyStatusesFor('بيع')}
          />
        </div>
        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="role-filter">التصنيف</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="التصنيف"
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            options={propertyCats}
          />
        </div>
        {/* <div className="w-full md:w-44 space-y-1.5">
          <Label htmlFor="role-filter">النوع</Label>
          <MultiSearchableSelect
            className="w-full md:w-44"
            placeholder="النوع"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={['مستقل', 'متعدد الوحدات']}
          />
        </div> */}

        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="activity-filter">حالة الاشغال</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="حالة الاشغال"
            value={activityFilter}
            onValueChange={setActivityFilter}
            options={activities}
          />
        </div>

        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="building-status-filter">حالة البناء</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="حالة البناء"
            value={buildingStatusFilter}
            onValueChange={setBuildingStatusFilter}
            options={buildingStatuses}
          />
        </div>

        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="governorate-filter">المحافظة</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="المحافظة"
            value={governorateFilter}
            onValueChange={setGovernorateFilter}
            options={governorates.map(g => ({ value: String(g.id), label: g.name }))}
          />
        </div>

        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="area-filter">المنطقة</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="المنطقة"
            value={areaFilter}
            onValueChange={setAreaFilter}
            options={areaOptions}
          />
        </div>

        <div className="w-full md:w-64 space-y-1.5">
          <Label>المساحة (م²)</Label>
          {/* Free-text range: "from" sets the lower bound, "to" the upper; either may be left empty. */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step={AREA_STEP}
              placeholder="من"
              value={minArea}
              onChange={e => setMinArea(e.target.value)}
              dir="ltr"
              className="h-9 text-center"
              aria-label="المساحة من"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              min={0}
              step={AREA_STEP}
              placeholder="إلى"
              value={maxArea}
              onChange={e => setMaxArea(e.target.value)}
              dir="ltr"
              className="h-9 text-center"
              aria-label="المساحة إلى"
            />
          </div>
        </div>

        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="soum-filter">السوم</Label>
          <Select value={soumFilter} onValueChange={v => setSoumFilter(v as SoumFilter)}>
            <SelectTrigger id="soum-filter" className="w-full md:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOUM_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-44 space-y-1.5">
          <Label htmlFor="sort-filter">الترتيب</Label>
          <Select value={sort} onValueChange={v => setSort(v as PropertySort)}>
            <SelectTrigger id="sort-filter" className="w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>اسم العقار</TableHead>
              <TableHead>المالك</TableHead>
              <TableHead>التصنيف</TableHead>
             {/* <TableHead>النوع</TableHead> */}
              <TableHead>تم التصوير</TableHead>
              <TableHead>الأولوية</TableHead>
              <TableHead>حالة الاشغال</TableHead>
              <TableHead>العنوان</TableHead>
              <TableHead>المساحة</TableHead>
              <TableHead>السعر</TableHead>
              <TableHead>حالة التسويق</TableHead>
              <TableHead>الحالة</TableHead>
              {/*  <TableHead>تاريخ الإضافة</TableHead> */}
              <TableHead>السوم</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={16} className="text-center py-8 text-muted-foreground">
                  جارٍ التحميل...
                </TableCell>
              </TableRow>
            ) : properties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={16} className="text-center py-8 text-muted-foreground">
                  لا توجد عقارات
                </TableCell>
              </TableRow>
            ) : properties.map((p, i) => (
              <TableRow key={p.id}>
                <TableCell>{p.property_code}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.owner_name}</TableCell>
                <TableCell>{p.category}</TableCell>
              {/*  <TableCell>{p.property_type}</TableCell> */}
                <TableCell>
                  <Badge variant={p.is_filmed ? 'default' : 'secondary'}>{p.is_filmed ? 'نعم' : 'لا'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={p.priority ? 'default' : 'secondary'}>{p.priority ? 'نعم' : 'لا'}</Badge>
                </TableCell>
                <TableCell>{p.activity || '-'}</TableCell>
                <TableCell className="max-w-[200px] truncate">{p.address}</TableCell>
                <TableCell>{p.area ? `${p.area} م²` : '-'}</TableCell>
                <TableCell>{p.price ? `${p.price.toLocaleString()} د.ك` : '-'}</TableCell>
                <TableCell>
                  <Badge variant={p.marketing_status ? 'default' : 'secondary'}>
                    {p.marketing_status ? 'تم' : 'لم يتم'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusColors[p.status]}>{p.status}</Badge>
                </TableCell>
                {/* <TableCell dir="ltr" className="text-left">{formatDateTime(p.created_at)}</TableCell> */}
                <TableCell>
                  {/* Tag button carrying the bid count in a corner badge, with
                      the highest bid underneath. Theme tokens stand in for the
                      mockup's raw hex: --primary is the same blue. */}
                  <div className="flex flex-col items-center gap-[3px]">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative h-[30px] w-[30px] rounded-[7px] text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={() => setSoumProperty(p)}
                      aria-label="سومات العقار"
                      title={p.top_soum_date ? `أعلى سوم بتاريخ ${formatDate(p.top_soum_date)}` : undefined}
                    >
                      <Tag size={16} />
                      <span
                        className={`absolute -top-1 -left-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[9.5px] font-bold text-white ${
                          p.soums_count ? 'bg-primary' : 'bg-muted-foreground'
                        }`}
                      >
                        {p.soums_count ?? 0}
                      </span>
                    </Button>
                    {p.top_soum_amount != null ? (
                      <span className="whitespace-nowrap text-[11px] font-bold text-primary">
                        {p.top_soum_amount.toLocaleString()} د.ك
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">لا يوجد</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setViewProperty(p)} title="عرض"><Eye size={16} /></Button>
                    {p.status === 'متاح' && (
                      <Button variant="ghost" size="icon" onClick={() => handleShowMatches(p)} title="الطلبات المطابقة"><ClipboardList size={16} /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleDownloadPdf(p)} disabled={downloadingId === p.id} title="تحميل PDF">
                      {downloadingId === p.id ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditingProperty(p); setFormOpen(true); }} title="تعديل"><Pencil size={16} /></Button>
                    {p.public_link_enabled && (
                      <Button variant="ghost" size="icon" onClick={() => handleCopyLink(p.public_link_token)} title="رابط المشاهدة"><Link2 size={16} /></Button>
                    )}
                    {p.property_type === 'متعدد الوحدات' && (
                      <Button variant="ghost" size="icon" onClick={() => openUnits(p.id)} title="إدارة الوحدات"><Layers size={16} /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)} title="حذف" className="text-destructive hover:text-destructive"><Trash2 size={16} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination
        currentPage={currentPage}
        lastPage={lastPage}
        total={total}
        perPage={perPage}
        loading={loading}
        onPageChange={setCurrentPage}
        onPerPageChange={handlePerPageChange}
      />

      <PropertyFormDrawer
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingProperty(null); }}
        property={editingProperty}
        listingType="بيع"
        onSave={handleSave}
      />

      <PropertyViewDrawer
        property={viewProperty}
        onClose={() => setViewProperty(null)}
        onUpdate={handleUpdateProperty}
      />

      <PropertySoumsDialog
        property={soumProperty}
        onClose={() => setSoumProperty(null)}
        // The row's count and highest bid come from the list query, so a bid
        // added or removed in the dialog only shows up after a refetch.
        onChanged={fetchProperties}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا العقار؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Matching requests Dialog */}
      <Dialog open={!!matchProperty} onOpenChange={(open) => !open && setMatchProperty(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>الطلبات المطابقة{matchProperty ? ` — ${matchProperty.name}` : ''}</DialogTitle>
          </DialogHeader>

          <MatchCriteriaFields value={matchOptions} onChange={setMatchOptions} idPrefix="sale-match" />

          {matchLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="animate-spin mx-auto" size={28} />
            </div>
          ) : matchRequests.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">لا توجد طلبات مطابقة</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>العميل</TableHead>
                    <TableHead>رقم الهاتف</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>النشاط</TableHead>
                    <TableHead>المساحة</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.client_name}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {r.client_phone
                          ? <a href={`tel:${r.client_phone}`} className="text-primary hover:underline">{r.client_phone}</a>
                          : '-'}
                      </TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.activity || '-'}</TableCell>
                      <TableCell>{r.area ? `${r.area} م²` : '-'}</TableCell>
                      <TableCell>{r.price != null ? `${r.price} د.ك` : '-'}</TableCell>
                      <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalePropertiesPage;
