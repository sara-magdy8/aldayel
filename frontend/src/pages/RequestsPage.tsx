import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Eye, Pencil, Trash2, LayoutList, Columns3, Search, Building2, Loader2 } from 'lucide-react';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import DataTablePagination, { DEFAULT_PER_PAGE } from '@/components/DataTablePagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Client, ClientRequest, Property, RequestType } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { requestsService } from '@/services/requests';
import { propertiesService } from '@/services/properties';
import { clientsService, ClientOption } from '@/services/clients';
import { MatchOptions } from '@/lib/query';
import MatchCriteriaFields, { DEFAULT_MATCH_OPTIONS } from '@/components/MatchCriteriaFields';
import RequestFormDialog from '@/components/RequestFormDialog';
import RequestViewDrawer from '@/components/RequestViewDrawer';
import { Label } from '@/components/ui/label';

// Step for the area (المساحة) range filter, in m². Filtering uses two free-text
// number inputs (from / to); an empty input means "unbounded" on that side.
const AREA_STEP = 10;

const statusColors: Record<string, string> = {
  'جديد': 'bg-blue-100 text-blue-800',
  'قيد المتابعة': 'bg-amber-100 text-amber-800',
  'مكتمل': 'bg-green-100 text-green-800',
};

const requestTypeColors: Record<string, string> = {
  'شراء': 'bg-purple-100 text-purple-800',
  'إيجار': 'bg-blue-100 text-blue-800',
};

const columnConfig: { key: string; label: string; color: string }[] = [
  { key: 'جديد', label: 'جديد 🔵', color: 'bg-blue-500' },
  { key: 'قيد المتابعة', label: 'قيد المتابعة 🟡', color: 'bg-amber-500' },
  { key: 'مكتمل', label: 'مكتمل 🟢', color: 'bg-green-500' },
];

interface Filters {
  search: string;
  status: string[];
  request_type: string[];
  activity_id: string[];
  governorate_id: string[];
  area_id: string[];
  min_area?: number;
  max_area?: number;
  page: number;
  per_page: number;
}

interface RequestsPageProps {
  /** When set, the page is scoped to a single request type: the type dropdown
   *  is hidden, the list is filtered to this type, and new requests default to it. */
  requestType?: RequestType;
}

const pageTitles: Record<RequestType, string> = {
  'إيجار': 'طلبات الإيجار',
  'شراء': 'طلبات الشراء',
};

const RequestsPage = ({ requestType }: RequestsPageProps) => {
  const { requestStatuses, activityOptions, governorates, areas } = useLookups();
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPage, setLastPage] = useState(1);
  // Total matching rows, driving the datatable pagination bar (page size lives in `filters`).
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: [],
    request_type: requestType ? [requestType] : [],
    activity_id: [],
    governorate_id: [],
    area_id: [],
    page: 1,
    per_page: DEFAULT_PER_PAGE,
  });

  // Area range filter (م²): raw input strings, debounced into `filters` below.
  // An empty string means that bound is unset.
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');

  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ClientRequest | null>(null);
  const [viewRequest, setViewRequest] = useState<ClientRequest | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Matching-properties dialog: the request whose matches we're showing, plus
  // the fetched rows and their loading state.
  const [matchRequest, setMatchRequest] = useState<ClientRequest | null>(null);
  const [matchProperties, setMatchProperties] = useState<Property[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  // معايير مطابقة اضافية — kept across openings so an agent doesn't re-pick
  // them for every request.
  const [matchOptions, setMatchOptions] = useState<MatchOptions>(DEFAULT_MATCH_OPTIONS);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const result = await requestsService.list({
          search: filters.search || undefined,
          status: filters.status,
          request_type: filters.request_type,
          activity_id: filters.activity_id,
          governorate_id: filters.governorate_id,
          area_id: filters.area_id,
          min_area: filters.min_area,
          max_area: filters.max_area,
          page: filters.page,
          per_page: filters.per_page,
        });
        if (!cancelled) {
          setRequests(result.data);
          setLastPage(result.last_page);
          setTotal(result.total);
        }
      } catch {
        if (!cancelled) toast.error('فشل تحميل الطلبات');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [filters]);

  // Seeds the client combobox before the user types; it re-queries on search.
  useEffect(() => {
    clientsService.options()
      .then(setClients)
      .catch(() => { /* non-fatal */ });
  }, []);

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const updateFilter = (patch: Partial<Omit<Filters, 'page'>>) =>
    setFilters(f => ({ ...f, ...patch, page: 1 }));

  // Changing the page size restarts from page 1.
  const handlePerPageChange = (per_page: number) =>
    setFilters(f => ({ ...f, per_page, page: 1 }));

  // ── Filter reset ───────────────────────────────────────────────────────────
  // On a type-scoped page (طلبات الإيجار / طلبات الشراء) `request_type` is fixed
  // by the route, not chosen by the user, so it is neither counted as an active
  // filter nor cleared by the reset.
  const hasActiveFilters =
    filters.search !== '' || minArea !== '' || maxArea !== '' ||
    [filters.status, filters.activity_id, filters.governorate_id, filters.area_id].some(f => f.length > 0) ||
    (!requestType && filters.request_type.length > 0);

  const resetFilters = () => {
    setMinArea('');
    setMaxArea('');
    updateFilter({
      search: '',
      status: [],
      request_type: requestType ? [requestType] : [],
      activity_id: [],
      governorate_id: [],
      area_id: [],
      min_area: undefined,
      max_area: undefined,
    });
  };

  // Debounce the area range inputs into the active filters so the list refetches
  // (skip the initial mount, when both inputs are empty and nothing has changed).
  const areaDebounceReady = useRef(false);
  useEffect(() => {
    if (!areaDebounceReady.current) { areaDebounceReady.current = true; return; }
    const t = setTimeout(() => {
      updateFilter({
        min_area: minArea !== '' ? Number(minArea) : undefined,
        max_area: maxArea !== '' ? Number(maxArea) : undefined,
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minArea, maxArea]);

  // Areas selectable in the filter: scoped to the chosen governorates, or all
  // when no governorate is picked.
  const areaFilterOptions = filters.governorate_id.length
    ? areas.filter(a => filters.governorate_id.includes(String(a.governorate_id)))
    : areas;

  // Changing the governorate filter drops any selected areas that fall outside it.
  const handleGovernorateFilter = (values: string[]) => {
    const govSet = new Set(values);
    const prunedAreas = govSet.size
      ? filters.area_id.filter(id => {
          const a = areas.find(x => String(x.id) === id);
          return a && govSet.has(String(a.governorate_id));
        })
      : filters.area_id;
    updateFilter({ governorate_id: values, area_id: prunedAreas });
  };

  // Show available properties that match an open request (same category,
  // activity, and area, matching listing type, status متاح).
  const handleShowMatches = (request: ClientRequest) => {
    setMatchRequest(request);
    setMatchProperties([]);
  };

  // The matching criteria are part of the query, so the list refetches whenever
  // they change while the dialog is open. Debounced so dragging a slider issues
  // one request on release rather than one per step.
  useEffect(() => {
    if (!matchRequest) return;
    let cancelled = false;
    setMatchLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await propertiesService.matchingForRequest(matchRequest.id, matchOptions);
        if (!cancelled) setMatchProperties(rows);
      } catch {
        if (!cancelled) {
          setMatchProperties([]);
          toast.error('تعذّر تحميل العقارات المطابقة');
        }
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [matchRequest, matchOptions]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleSave = async (formData: ClientRequest) => {
    const payload = {
      client_id: formData.client_id,
      request_type: formData.request_type,
      category: formData.category,
      activities: formData.activities,
      governorate_id: formData.governorate_id,
      // Always sent (empty array clears): an omitted key would leave the previously
      // linked areas in place, the same reason broker_id is sent as explicit null.
      area_ids: formData.area_ids ?? [],
      area: formData.area,
      price: formData.price,
      // Explicit null, not undefined: an omitted key would be absent from the
      // request body and leave the previously linked broker in place.
      broker_id: formData.broker_id ?? null,
      notes: formData.notes,
      status: formData.status,
    };

    try {
      if (editingRequest) {
        const updated = await requestsService.update(editingRequest.id, payload);
        setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
        toast.success('تم تعديل الطلب بنجاح');
      } else {
        const created = await requestsService.create(payload);
        setRequests(prev => [created, ...prev]);
        toast.success('تم إضافة الطلب بنجاح');
      }
    } catch {
      toast.error('حدث خطأ، يرجى المحاولة مجدداً');
    }
    setEditingRequest(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await requestsService.remove(deleteId);
      setRequests(prev => prev.filter(r => r.id !== deleteId));
      toast.success('تم حذف الطلب');
    } catch {
      toast.error('فشل حذف الطلب');
    }
    setDeleteId(null);
  };

  const handleClientAdded = (client: Client) => {
    setClients(prev => [...prev, client]);
  };

  // ── Kanban grouping ────────────────────────────────────────────────────────

  const groupedRequests = useMemo(() => {
    const groups: Record<string, ClientRequest[]> = { 'جديد': [], 'قيد المتابعة': [], 'مكتمل': [] };
    requests.forEach(r => { if (groups[r.status]) groups[r.status].push(r); });
    return groups;
  }, [requests]);

  // ── Sub-component ─────────────────────────────────────────────────────────

  const RequestCard = ({ r }: { r: ClientRequest }) => (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-bold text-sm">{r.client_name}</p>
        <Badge variant="secondary" className={`text-xs ${requestTypeColors[r.request_type]}`}>{r.request_type}</Badge>
      </div>
      <p className="text-xs text-muted-foreground" dir="ltr">{r.client_phone}</p>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-xs">{r.category}</Badge>
        {r.activity && <Badge variant="outline" className="text-xs">{r.activity}</Badge>}
        {(r.governorate || r.area_name) && (
          <span className="text-xs text-muted-foreground">{[r.governorate, r.area_name].filter(Boolean).join(' - ')}</span>
        )}
      </div>
      {(r.area || r.price != null) && (
        <p className="text-xs text-muted-foreground">
          {[r.area ? `${r.area} م²` : null, r.price != null ? `${r.price} د.ك` : null].filter(Boolean).join(' — ')}
        </p>
      )}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">{r.created_at}</span>
        <div className="flex gap-1">
          {r.status !== 'مكتمل' && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleShowMatches(r)} title="العقارات المطابقة"><Building2 size={14} /></Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRequest(r); setFormOpen(true); }}><Pencil size={14} /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 size={14} /></Button>
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">{requestType ? pageTitles[requestType] : 'الطلبات'}</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex border rounded-md overflow-hidden">
            <Button variant={view === 'kanban' ? 'default' : 'ghost'} size="sm" onClick={() => setView('kanban')} className="rounded-none gap-1">
              <Columns3 size={16} /> لوحة
            </Button>
            <Button variant={view === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setView('table')} className="rounded-none gap-1">
              <LayoutList size={16} /> جدول
            </Button>
          </div>
          <Button onClick={() => { setEditingRequest(null); setFormOpen(true); }} className="gap-2 w-full sm:w-auto">
            <Plus size={18} /> إضافة طلب
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <div className="space-y-1.5">
            <Label htmlFor="role-filter">بحث</Label>
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/8 text-muted-foreground" />
            <Input
              placeholder="بحث باسم العميل..."
              value={filters.search}
              onChange={e => updateFilter({ search: e.target.value })}
              className="pr-9"
            />
          </div>
        </div>
        {!requestType && (
          <div className="w-full md:w-36 space-y-1.5">
            <Label htmlFor="role-filter">نوع الطلب</Label>
            <MultiSearchableSelect
              className="w-[130px]"
              placeholder="نوع الطلب"
              value={filters.request_type}
              onValueChange={v => updateFilter({ request_type: v })}
              options={['شراء', 'إيجار']}
            />
          </div>
        )}
        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="role-filter">الحالة</Label>
          <MultiSearchableSelect
            className="w-[150px]"
            placeholder="كل الحالات"
            value={filters.status}
            onValueChange={v => updateFilter({ status: v })}
            options={requestStatuses}
          />
        </div>

        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="activity-filter">النشاط</Label>
          <MultiSearchableSelect
            className="w-[150px]"
            placeholder="كل الأنشطة"
            value={filters.activity_id}
            onValueChange={v => updateFilter({ activity_id: v })}
            options={activityOptions.map(a => ({ value: String(a.id), label: a.name }))}
          />
        </div>

        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="governorate-filter">المحافظة</Label>
          <MultiSearchableSelect
            className="w-[150px]"
            placeholder="كل المحافظات"
            value={filters.governorate_id}
            onValueChange={handleGovernorateFilter}
            options={governorates.map(g => ({ value: String(g.id), label: g.name }))}
          />
        </div>

        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="area-filter">المنطقة</Label>
          <MultiSearchableSelect
            className="w-[150px]"
            placeholder="كل المناطق"
            value={filters.area_id}
            onValueChange={v => updateFilter({ area_id: v })}
            options={areaFilterOptions.map(a => ({ value: String(a.id), label: a.name }))}
          />
        </div>

        {/* Area (المساحة) range slider */}
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

        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          جاري التحميل...
        </div>
      )}

      {/* Kanban View */}
      {!loading && view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columnConfig.map(col => (
            <div key={col.key} className="bg-muted/50 rounded-lg">
              <div className={`${col.color} text-white text-center py-2 rounded-t-lg font-bold text-sm`}>
                {col.label} ({groupedRequests[col.key]?.length || 0})
              </div>
              <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                {groupedRequests[col.key]?.map(r => <RequestCard key={r.id} r={r} />)}
                {(!groupedRequests[col.key] || groupedRequests[col.key].length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">لا توجد طلبات</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table View */}
      {!loading && view === 'table' && (
        <div className="bg-card rounded-lg border overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>رقم الهاتف</TableHead>
                <TableHead>نوع الطلب</TableHead>
                <TableHead>التصنيف</TableHead>
                <TableHead>النشاط</TableHead>
                <TableHead>المحافظة</TableHead>
                <TableHead>المنطقة</TableHead>
                <TableHead>المساحة</TableHead>
                <TableHead>السعر</TableHead>
                <TableHead>الوسيط</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{(filters.page - 1) * filters.per_page + i + 1}</TableCell>
                  <TableCell className="font-medium">{r.client_name}</TableCell>
                  <TableCell dir="ltr" className="text-left">{r.client_phone}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={requestTypeColors[r.request_type]}>{r.request_type}</Badge>
                  </TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.activity || '-'}</TableCell>
                  <TableCell>{r.governorate || '-'}</TableCell>
                  <TableCell>{r.area_name || '-'}</TableCell>
                  <TableCell>{r.area ? `${r.area} م²` : '-'}</TableCell>
                  <TableCell>{r.price != null ? `${r.price} د.ك` : '-'}</TableCell>
                  <TableCell>{r.broker_name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.created_at}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewRequest(r)} title="عرض"><Eye size={16} /></Button>
                      {r.status !== 'مكتمل' && (
                        <Button variant="ghost" size="icon" onClick={() => handleShowMatches(r)} title="العقارات المطابقة"><Building2 size={16} /></Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => { setEditingRequest(r); setFormOpen(true); }} title="تعديل"><Pencil size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)} title="حذف" className="text-destructive hover:text-destructive"><Trash2 size={16} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">لا توجد طلبات</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <DataTablePagination
          currentPage={filters.page}
          lastPage={lastPage}
          total={total}
          perPage={filters.per_page}
          loading={loading}
          onPageChange={page => setFilters(f => ({ ...f, page }))}
          onPerPageChange={handlePerPageChange}
        />
      )}

      <RequestFormDialog
        open={formOpen}
        onOpenChange={o => { setFormOpen(o); if (!o) setEditingRequest(null); }}
        request={editingRequest}
        clients={clients}
        lockedType={requestType}
        onSave={handleSave}
        onClientAdded={handleClientAdded}
      />
      <RequestViewDrawer request={viewRequest} onClose={() => setViewRequest(null)} />

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Matching properties Dialog */}
      <Dialog open={!!matchRequest} onOpenChange={(open) => !open && setMatchRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>العقارات المطابقة{matchRequest ? ` — ${matchRequest.client_name}` : ''}</DialogTitle>
          </DialogHeader>

          <MatchCriteriaFields value={matchOptions} onChange={setMatchOptions} idPrefix="request-match" />

          {matchLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="animate-spin mx-auto" size={28} />
            </div>
          ) : matchProperties.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">لا توجد عقارات مطابقة</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>كود العقار</TableHead>
                    <TableHead>المالك</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>النشاط</TableHead>
                    <TableHead>المساحة</TableHead>
                    <TableHead>العنوان</TableHead>
                    <TableHead>السعر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchProperties.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.property_code}</TableCell>
                      <TableCell>{p.owner_name || '-'}</TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell>{p.activity || '-'}</TableCell>
                      <TableCell>{p.area ? `${p.area} م²` : '-'}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{p.address}</TableCell>
                      <TableCell>
                        {p.listing_type === 'إيجار'
                          ? (p.rent_amount ? `${p.rent_amount} د.ك` : '-')
                          : (p.price ? `${p.price} د.ك` : '-')}
                      </TableCell>
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

export default RequestsPage;
