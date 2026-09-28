import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, Building2, CalendarClock, CalendarX,
  CreditCard, FileWarning, Loader2, Settings, SquareArrowOutUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import DataTablePagination, { DEFAULT_PER_PAGE } from '@/components/DataTablePagination';
import { useNotifications } from '@/contexts/NotificationsContext';
import {
  notificationsService, AppNotification, NotificationType,
  NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS,
} from '@/services/notifications';
import { propertiesService, PropertyWithoutContract } from '@/services/properties';
import { formatDateTime } from '@/lib/utils';

/** Options for the type filter — value is the slug the backend expects. */
const TYPE_OPTIONS = NOTIFICATION_TYPES.map(value => ({ value, label: NOTIFICATION_TYPE_LABELS[value] }));

/** Icon and colours per kind, so a row is recognisable before it is read. */
const TYPE_STYLES: Record<NotificationType, { icon: typeof Bell; badge: string; avatar: string }> = {
  match: {
    icon: Building2,
    badge: 'bg-blue-100 text-blue-800',
    avatar: 'bg-blue-50 text-blue-600',
  },
  contract_expiry: {
    icon: CalendarClock,
    badge: 'bg-amber-100 text-amber-800',
    avatar: 'bg-amber-50 text-amber-600',
  },
  payment_link: {
    icon: CreditCard,
    badge: 'bg-emerald-100 text-emerald-800',
    avatar: 'bg-emerald-50 text-emerald-600',
  },
};

/**
 * Arabic counts its units in singular, dual and two plurals — "منذ 2 ساعات"
 * reads wrong. Same forms the backend uses for a reminder's offset, and the
 * mails use for their expiry phrase.
 */
const AR_UNITS: Record<'minute' | 'hour' | 'day', [string, string, string, string]> = {
  minute: ['دقيقة واحدة', 'دقيقتين', 'دقائق', 'دقيقة'],
  hour: ['ساعة واحدة', 'ساعتين', 'ساعات', 'ساعة'],
  day: ['يوم واحد', 'يومين', 'أيام', 'يوماً'],
};

const arCount = (n: number, unit: keyof typeof AR_UNITS): string => {
  const [one, two, few, many] = AR_UNITS[unit];
  if (n === 1) return one;
  if (n === 2) return two;
  return n <= 10 ? `${n} ${few}` : `${n} ${many}`;
};

/**
 * "منذ ٣ ساعات" for anything recent, falling back to the plain timestamp once a
 * month has passed — past that, "منذ 47 يوماً" is harder to place than the date.
 */
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return formatDateTime(iso);

  const seconds = Math.floor((Date.now() - then) / 1000);
  // Clock skew between the browser and the server can put a fresh row a few
  // seconds in the future; it is still "الآن", not a negative age.
  if (seconds < 60) return 'الآن';
  if (seconds < 3600) return `منذ ${arCount(Math.floor(seconds / 60), 'minute')}`;
  if (seconds < 86400) return `منذ ${arCount(Math.floor(seconds / 3600), 'hour')}`;
  if (seconds < 2592000) return `منذ ${arCount(Math.floor(seconds / 86400), 'day')}`;
  return formatDateTime(iso);
};

/** The closing notice is a different event from a warning, and reads red. */
const isEndedNotice = (item: AppNotification) =>
  item.type === 'contract_expiry' && item.meta.ended === true;

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { setUnread } = useNotifications();

  // ── Feed data ───────────────────────────────────────────────────────────
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  // ── This visit ──────────────────────────────────────────────────────────
  /**
   * The watermark this visit started from, and how many notifications had
   * arrived since. Both frozen from the first response, because opening the
   * page is what marks everything read: by the second request the backend has
   * already moved the watermark past these rows and would report them all as
   * read, so the per-row flag cannot carry the highlight through paging.
   */
  const [visitStart, setVisitStart] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const visitCaptured = useRef(false);

  // ── عقارات بدون عقد ──────────────────────────────────────────────────────
  // Standing state, not events: مؤجر / مباع properties with no contract yet.
  // Deliberately outside the feed's filters and paging — it is a to-do list, and
  // filtering it by "من تاريخ" would hide work rather than narrow it.
  const [noContract, setNoContract] = useState<PropertyWithoutContract[]>([]);
  const [noContractLoading, setNoContractLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    propertiesService.withoutContract()
      .then(rows => { if (!cancelled) setNoContract(rows); })
      // Silent: the feed below is the page's main job and still renders.
      .catch(() => { if (!cancelled) setNoContract([]); })
      .finally(() => { if (!cancelled) setNoContractLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<NotificationType[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Debounce search → reset page ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Reset page when filters change ──────────────────────────────────────
  useEffect(() => { setPage(1); }, [typeFilter, dateFrom, dateTo]);

  // Changing the page size restarts from page 1 — batched with the size change
  // itself so the list refetches once, not twice.
  const handlePerPageChange = (n: number) => {
    setPerPage(n);
    setPage(1);
  };

  const hasActiveFilters =
    search !== '' || typeFilter.length > 0 || dateFrom !== '' || dateTo !== '';

  const resetFilters = () => {
    setSearch('');
    setTypeFilter([]);
    setDateFrom('');
    setDateTo('');
  };

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsService.list({
        search: debouncedSearch,
        types: typeFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: perPage,
      });
      setItems(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);

      if (!visitCaptured.current) {
        visitCaptured.current = true;
        setVisitStart(res.read_before);
        setNewCount(res.unread_count);

        // Opening the page is what reads it. Skipped when nothing is new, so an
        // idle screen is not writing to the users table on every visit.
        if (res.unread_count > 0) {
          notificationsService
            .markSeen()
            .then(() => setUnread(0))
            // The badge is decoration; a failed stamp just means it clears on the
            // next visit, which is not worth interrupting the user for.
            .catch(() => {});
        }
      }
    } catch {
      toast.error('تعذّر تحميل التنبيهات');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, typeFilter, dateFrom, dateTo, page, perPage, setUnread]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  /**
   * New to this visit — sent after the watermark the visit started from. A first
   * ever visit has no watermark, so the whole backlog is genuinely new.
   */
  const isNew = useCallback(
    (item: AppNotification) =>
      visitStart === null || new Date(item.occurred_at) > new Date(visitStart),
    [visitStart],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">التنبيهات</h1>
          {newCount > 0 && (
            <Badge className="bg-primary text-primary-foreground">{newCount} جديد</Badge>
          )}
        </div>
        <Button variant="outline" className="gap-2 w-full sm:w-auto" title="إعدادات التنبيهات" asChild>
          <Link to="/notifications/settings">
            <Settings size={18} />
          </Link>
        </Button>
      </div>

      {/* عقارات بدون عقد — its own section, above the event feed */}
      {(noContractLoading || noContract.length > 0) && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
            <FileWarning className="h-5 w-5 text-orange-600 shrink-0" />
            <h2 className="text-sm font-bold text-foreground">عقارات بدون عقد</h2>
            {!noContractLoading && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">{noContract.length}</Badge>
            )}
            <span className="text-xs text-muted-foreground">عقارات مؤجرة أو مباعة لم يُسجَّل لها عقد بعد</span>
          </div>

          {noContractLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="inline animate-spin text-muted-foreground" size={20} />
            </div>
          ) : (
            noContract.map(p => (
              <div key={p.id} className="flex gap-3 p-4 border-b last:border-b-0 transition-colors hover:bg-muted/40">
                <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-orange-50 text-orange-600">
                  <Building2 size={20} />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {[p.property_code, p.name].filter(Boolean).join(' — ')}
                    </span>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800">{p.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    {p.address ? `${p.address} — ` : ''}لم يُسجَّل عقد لهذا العقار.
                  </p>
                  <div className="text-xs text-muted-foreground">
                    <span title={formatDateTime(p.updated_at)}>آخر تحديث: {relativeTime(p.updated_at)}</span>
                  </div>
                </div>

                <div className="flex items-start shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    // Straight to the contract list for its kind — creating the
                    // missing contract is the action this row is asking for.
                    onClick={() => navigate(p.listing_type === 'بيع' ? '/contracts/sale' : '/contracts/rent')}
                    title="إضافة عقد"
                  >
                    <SquareArrowOutUpRight size={16} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label>بحث</Label>
          <Input
            placeholder="بحث باسم العميل أو رقم العقد أو العقار..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full md:w-72"
          />
        </div>
        <div className="w-full md:w-48 space-y-1.5">
          <Label>النوع</Label>
          <MultiSearchableSelect
            className="w-full md:w-48"
            placeholder="الكل"
            value={typeFilter}
            onValueChange={values => setTypeFilter(values as NotificationType[])}
            options={TYPE_OPTIONS}
          />
        </div>
        <div className="space-y-1.5">
          <Label>من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full md:w-44" />
        </div>
        <div className="space-y-1.5">
          <Label>إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full md:w-44" />
        </div>
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      {/* Feed */}
      <div className="bg-card rounded-lg border overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="inline animate-spin text-muted-foreground" size={24} />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-2">
            <BellOff className="inline" size={28} />
            <p>{hasActiveFilters ? 'لا توجد تنبيهات مطابقة للفلاتر' : 'لا توجد تنبيهات'}</p>
          </div>
        ) : (
          items.map(item => {
            const ended = isEndedNotice(item);
            const style = TYPE_STYLES[item.type];
            const Icon = ended ? CalendarX : style.icon;
            const badgeClass = ended ? 'bg-red-100 text-red-800' : style.badge;
            const avatarClass = ended ? 'bg-red-50 text-red-600' : style.avatar;
            const fresh = isNew(item);

            return (
              <div
                key={item.id}
                className={`flex gap-3 p-4 border-b last:border-b-0 transition-colors hover:bg-muted/40 ${
                  fresh ? 'bg-primary/[0.04] border-r-4 border-r-primary' : ''
                }`}
              >
                <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${avatarClass}`}>
                  <Icon size={20} />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${fresh ? 'font-bold' : 'font-medium'} text-foreground`}>
                      {item.title}
                    </span>
                    <Badge variant="secondary" className={badgeClass}>
                      {NOTIFICATION_TYPE_LABELS[item.type]}
                    </Badge>
                    {fresh && <span className="h-2 w-2 rounded-full bg-primary" title="جديد" />}
                  </div>

                  <p className="text-sm text-muted-foreground break-words">{item.body}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {/* The exact instant sits in the tooltip — the feed reads by
                        age, but the office needs the timestamp when it matters. */}
                    <span title={formatDateTime(item.occurred_at)}>{relativeTime(item.occurred_at)}</span>
                    {item.recipient && (
                      <span className="truncate">
                        أُرسل إلى: <span dir="ltr" className="inline-block align-bottom">{item.recipient}</span>
                      </span>
                    )}
                  </div>
                </div>

                {item.link && (
                  <div className="flex items-start shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => navigate(item.link)} title="عرض">
                      <SquareArrowOutUpRight size={16} />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <DataTablePagination
        currentPage={page}
        lastPage={lastPage}
        total={total}
        perPage={perPage}
        loading={loading}
        onPageChange={setPage}
        onPerPageChange={handlePerPageChange}
      />
    </div>

    
  );
};

export default NotificationsPage;
