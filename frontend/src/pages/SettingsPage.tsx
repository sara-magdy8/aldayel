import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Building2, Tags, LayoutGrid, CreditCard, CalendarClock, Activity, Camera, Building, X, Plus, Save, Upload, Loader2, Wallet, Copy, Trash2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { settingsService, type PropertyCat, type PaymentType, type PaymentTerm, type Activity as ActivityType, type FilmedBy, type BuildingStatus, type PaymentProvider, type PaymentGateway, type LookupScope } from '@/services/settings';
import { storageUrl } from '@/services/api';
import { setFavicon } from '@/hooks/useDocumentBranding';
import type { ApiError } from '@/services/api';

// ── Payment gateways ────────────────────────────────────────────────────────

/**
 * Providers offered in the gateway dropdown, each with the credential fields it
 * needs. The field set differs per provider, so it drives the rendered inputs —
 * add a provider here (and to GATEWAY_FIELDS in SettingController) to support it.
 */
const GATEWAYS: {
  value: PaymentProvider;
  label: string;
  fields: { key: string; label: string; secret?: boolean }[];
}[] = [
  {
    value: 'hesabe',
    label: 'حسابى | Hesabe',
    fields: [
      { key: 'merchant_code', label: 'Merchant Code' },
      { key: 'access_code', label: 'Access Code' },
      { key: 'secret_key', label: 'Secret Key', secret: true },
      { key: 'iv_key', label: 'IV Key', secret: true },
    ],
  },
];

const gatewayFields = (provider: PaymentProvider) =>
  GATEWAYS.find(g => g.value === provider)?.fields ?? [];

// ── التصنيفات والنشاط: one list per listing type ────────────────────────────

/** The two sides each list is kept for, in the order the cards are laid out. */
const LOOKUP_SCOPES: LookupScope[] = ['إيجار', 'بيع'];

/** An empty draft per side, so each card's input is independent. */
const emptyDrafts = (): Record<LookupScope, string> => ({ 'إيجار': '', 'بيع': '' });

/** A row belongs to a side when that side's flag is set; it may be in both. */
const inScope = (row: { for_rental: boolean; for_sale: boolean }, scope: LookupScope) =>
  scope === 'إيجار' ? row.for_rental : row.for_sale;

/** The row with `scope`'s flag cleared — what a removal leaves behind. */
const withoutScope = <T extends { for_rental: boolean; for_sale: boolean }>(row: T, scope: LookupScope): T =>
  scope === 'إيجار' ? { ...row, for_rental: false } : { ...row, for_sale: false };

/**
 * One editable chip list. Rendered once per side for each of التصنيفات and
 * النشاط, so the two sides stay visually identical and only their contents differ.
 */
const LookupListCard = <T extends { id: number; name: string; for_rental: boolean; for_sale: boolean }>({
  title, icon, rows, scope, draft, onDraftChange, onAdd, onRemove, saving, placeholder, addLabel,
}: {
  title: string;
  icon: React.ReactNode;
  rows: T[];
  scope: LookupScope;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (row: T) => void;
  saving: boolean;
  placeholder: string;
  addLabel: string;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {rows.filter(row => inScope(row, scope)).map(row => (
          <Badge key={row.id} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
            {row.name}
            <button onClick={() => onRemove(row)} className="hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
        />
        <Button onClick={onAdd} disabled={saving} variant="outline" className="shrink-0">
          <Plus className="h-4 w-4 ml-1" />
          {addLabel}
        </Button>
      </div>
    </CardContent>
  </Card>
);

/**
 * One editable account row. `id` is null until the account is saved; `uid` is a
 * client-side key so rows keep their identity while being added/copied/removed.
 */
interface GatewayForm {
  uid: number;
  id: number | null;
  name: string;
  gateway: PaymentProvider;
  credentials: Record<string, string>;
}

let gatewayUid = 0;

const blankGateway = (): GatewayForm => ({
  uid: ++gatewayUid,
  id: null,
  name: '',
  gateway: 'hesabe',
  credentials: {},
});

const SettingsPage = () => {
  const { toast } = useToast();

  // ── Office info ──────────────────────────────────────────────────────────
  const [officeName, setOfficeName] = useState('');
  const [officeDescription, setOfficeDescription] = useState('');
  const [officePhone, setOfficePhone] = useState('');
  const [officeEmail, setOfficeEmail] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Lookup: property categories (CRUD against /api/lookups/property-cats) ──
  // One row list for both sides; each row carries the side(s) it appears in, and
  // the draft/saving state is per side so the two cards work independently.
  const [categories, setCategories] = useState<PropertyCat[]>([]);
  const [newCategory, setNewCategory] = useState(emptyDrafts);
  const [savingCategory, setSavingCategory] = useState<LookupScope | null>(null);

  // ── Lookup: payment types (CRUD against /api/lookups/payment-types) ───────
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [newPaymentType, setNewPaymentType] = useState('');
  const [savingPaymentType, setSavingPaymentType] = useState(false);

  // ── Lookup: payment terms (CRUD against /api/lookups/payment-terms) ───────
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [newPaymentTerm, setNewPaymentTerm] = useState('');
  const [savingPaymentTerm, setSavingPaymentTerm] = useState(false);

  // ── Lookup: activities (CRUD against /api/lookups/activities) ─────────────
  // Split per listing type exactly as the categories above.
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [newActivity, setNewActivity] = useState(emptyDrafts);
  const [savingActivity, setSavingActivity] = useState<LookupScope | null>(null);

  // ── Lookup: filmed by (CRUD against /api/lookups/filmed-by) ────────────────
  const [filmedBy, setFilmedBy] = useState<FilmedBy[]>([]);
  const [newFilmedBy, setNewFilmedBy] = useState('');
  const [savingFilmedBy, setSavingFilmedBy] = useState(false);

  // ── Lookup: building statuses (CRUD against /api/lookups/building-statuses) ──
  const [buildingStatuses, setBuildingStatuses] = useState<BuildingStatus[]>([]);
  const [newBuildingStatus, setNewBuildingStatus] = useState('');
  const [savingBuildingStatus, setSavingBuildingStatus] = useState(false);

  // ── Payment gateways (synced with /api/settings/payment-gateways) ─────────
  const [gateways, setGateways] = useState<GatewayForm[]>([]);
  const [savingGateways, setSavingGateways] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  // ── Unit types (local only — no backend entity yet) ───────────────────────
  const [unitTypes, setUnitTypes] = useState<string[]>([
    'شقة', 'محل', 'مكتب', 'مستودع',
  ]);
  const [newUnitType, setNewUnitType] = useState('');

  // ── Load settings + property categories on mount ──────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [settings, propCats, payTypes, payTerms, acts, filmed, buildings, gateway] = await Promise.all([
          settingsService.load(),
          settingsService.listPropertyCats(),
          settingsService.listPaymentTypes(),
          settingsService.listPaymentTerms(),
          settingsService.listActivities(),
          settingsService.listFilmedBy(),
          // Tolerated the same way as the gateways below — this table arrived later
          // than the rest, so an un-migrated environment loses only this one card.
          settingsService.listBuildingStatuses().catch((): BuildingStatus[] => []),
          // Tolerated separately: the rest of the page still loads if the
          // gateways migration hasn't been run on this environment yet.
          settingsService.listPaymentGateways().catch((): PaymentGateway[] => []),
        ]);

        setOfficeName(settings.office_name ?? '');
        setOfficeDescription(settings.office_description ?? '');
        setOfficePhone(settings.office_phone ?? '');
        setOfficeEmail(settings.office_email ?? '');
        setOfficeAddress(settings.office_address ?? '');
        if (settings.office_logo) setLogoPreview(storageUrl(settings.office_logo));
        if (settings.office_favicon) setFaviconPreview(storageUrl(settings.office_favicon));

        setCategories(propCats);
        setPaymentTypes(payTypes);
        setPaymentTerms(payTerms);
        setActivities(acts);
        setFilmedBy(filmed);
        setBuildingStatuses(buildings);
        setGateways(gateway.map(g => ({
          uid: ++gatewayUid,
          id: g.id,
          name: g.name,
          gateway: g.gateway,
          credentials: { ...(g.credentials ?? {}) },
        })));
      } catch {
        toast({ title: 'خطأ', description: 'تعذّر تحميل الإعدادات', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Logo file selection (local preview only; uploaded on save) ────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Favicon file selection (local preview only; uploaded on save) ─────────
  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setFaviconPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Save office info (upload logo/favicon first if new ones were chosen) ──
  const handleSaveOffice = async () => {
    setSaving(true);
    try {
      if (logoFile) {
        const { logo_url } = await settingsService.uploadLogo(logoFile);
        setLogoPreview(logo_url);
        setLogoFile(null);
      }

      if (faviconFile) {
        const { favicon_url } = await settingsService.uploadFavicon(faviconFile);
        setFaviconPreview(favicon_url);
        setFaviconFile(null);
        // Swap the tab icon straight away instead of waiting for a reload —
        // useDocumentBranding only reads branding once, on mount.
        setFavicon(favicon_url);
      }

      await settingsService.save({
        office_name: officeName,
        office_description: officeDescription,
        office_phone: officePhone,
        office_email: officeEmail,
        office_address: officeAddress,
      });

      toast({ title: 'تم الحفظ', description: 'تم حفظ بيانات المكتب بنجاح' });
    } catch {
      toast({ title: 'خطأ', description: 'تعذّر حفظ الإعدادات', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Category helpers (backed by /api/lookups/property-cats) ───────────────
  // Every one of these works on a single side's list; the row underneath may be
  // shared with the other side, which is why adding merges by id rather than
  // appending, and removing keeps the row while the other side still shows it.
  const addCategory = async (scope: LookupScope) => {
    const trimmed = newCategory[scope].trim();
    if (!trimmed || savingCategory) return;
    if (categories.some((c) => c.name === trimmed && inScope(c, scope))) {
      toast({ title: 'موجود مسبقاً', description: `التصنيف "${trimmed}" مضاف بالفعل`, variant: 'destructive' });
      return;
    }
    setSavingCategory(scope);
    try {
      const saved = await settingsService.createPropertyCat(trimmed, scope);
      setCategories((prev) => prev.some((c) => c.id === saved.id)
        ? prev.map((c) => (c.id === saved.id ? saved : c))
        : [...prev, saved]);
      setNewCategory((prev) => ({ ...prev, [scope]: '' }));
      toast({ title: 'تمت الإضافة', description: `تم إضافة التصنيف "${saved.name}"` });
    } catch (err) {
      const msg = (err as ApiError).errors?.name?.[0] ?? (err as ApiError).message ?? 'تعذّر إضافة التصنيف';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingCategory(null);
    }
  };

  const removeCategory = async (cat: PropertyCat, scope: LookupScope) => {
    try {
      await settingsService.deletePropertyCat(cat.id, scope);
      const remaining = withoutScope(cat, scope);
      setCategories((prev) => (remaining.for_rental || remaining.for_sale)
        ? prev.map((c) => (c.id === cat.id ? remaining : c))
        : prev.filter((c) => c.id !== cat.id));
      toast({ title: 'تم الحذف', description: `تم حذف التصنيف "${cat.name}"` });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر حذف التصنيف';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    }
  };

  // ── Payment-type helpers (backed by /api/lookups/payment-types) ───────────
  const addPaymentType = async () => {
    const trimmed = newPaymentType.trim();
    if (!trimmed || savingPaymentType) return;
    if (paymentTypes.some((p) => p.name === trimmed)) {
      toast({ title: 'موجود مسبقاً', description: `طريقة الدفع "${trimmed}" مضافة بالفعل`, variant: 'destructive' });
      return;
    }
    setSavingPaymentType(true);
    try {
      const created = await settingsService.createPaymentType(trimmed);
      setPaymentTypes((prev) => [...prev, created]);
      setNewPaymentType('');
      toast({ title: 'تمت الإضافة', description: `تم إضافة طريقة الدفع "${created.name}"` });
    } catch (err) {
      const msg = (err as ApiError).errors?.name?.[0] ?? (err as ApiError).message ?? 'تعذّر إضافة طريقة الدفع';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingPaymentType(false);
    }
  };

  const removePaymentType = async (type: PaymentType) => {
    try {
      await settingsService.deletePaymentType(type.id);
      setPaymentTypes((prev) => prev.filter((p) => p.id !== type.id));
      toast({ title: 'تم الحذف', description: `تم حذف طريقة الدفع "${type.name}"` });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر حذف طريقة الدفع';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    }
  };

  // ── Payment-term helpers (backed by /api/lookups/payment-terms) ───────────
  const addPaymentTerm = async () => {
    const trimmed = newPaymentTerm.trim();
    if (!trimmed || savingPaymentTerm) return;
    if (paymentTerms.some((p) => p.name === trimmed)) {
      toast({ title: 'موجود مسبقاً', description: `مدة الدفع "${trimmed}" مضافة بالفعل`, variant: 'destructive' });
      return;
    }
    setSavingPaymentTerm(true);
    try {
      const created = await settingsService.createPaymentTerm(trimmed);
      setPaymentTerms((prev) => [...prev, created]);
      setNewPaymentTerm('');
      toast({ title: 'تمت الإضافة', description: `تم إضافة مدة الدفع "${created.name}"` });
    } catch (err) {
      const msg = (err as ApiError).errors?.name?.[0] ?? (err as ApiError).message ?? 'تعذّر إضافة مدة الدفع';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingPaymentTerm(false);
    }
  };

  const removePaymentTerm = async (term: PaymentTerm) => {
    try {
      await settingsService.deletePaymentTerm(term.id);
      setPaymentTerms((prev) => prev.filter((p) => p.id !== term.id));
      toast({ title: 'تم الحذف', description: `تم حذف مدة الدفع "${term.name}"` });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر حذف مدة الدفع';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    }
  };

  // ── Activity helpers (backed by /api/lookups/activities) ──────────────────
  // Per-side, exactly as the category helpers above.
  const addActivity = async (scope: LookupScope) => {
    const trimmed = newActivity[scope].trim();
    if (!trimmed || savingActivity) return;
    if (activities.some((a) => a.name === trimmed && inScope(a, scope))) {
      toast({ title: 'موجود مسبقاً', description: `النشاط "${trimmed}" مضاف بالفعل`, variant: 'destructive' });
      return;
    }
    setSavingActivity(scope);
    try {
      const saved = await settingsService.createActivity(trimmed, scope);
      setActivities((prev) => prev.some((a) => a.id === saved.id)
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [...prev, saved]);
      setNewActivity((prev) => ({ ...prev, [scope]: '' }));
      toast({ title: 'تمت الإضافة', description: `تم إضافة النشاط "${saved.name}"` });
    } catch (err) {
      const msg = (err as ApiError).errors?.name?.[0] ?? (err as ApiError).message ?? 'تعذّر إضافة النشاط';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingActivity(null);
    }
  };

  const removeActivity = async (activity: ActivityType, scope: LookupScope) => {
    try {
      await settingsService.deleteActivity(activity.id, scope);
      const remaining = withoutScope(activity, scope);
      setActivities((prev) => (remaining.for_rental || remaining.for_sale)
        ? prev.map((a) => (a.id === activity.id ? remaining : a))
        : prev.filter((a) => a.id !== activity.id));
      toast({ title: 'تم الحذف', description: `تم حذف النشاط "${activity.name}"` });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر حذف النشاط';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    }
  };

  // ── Filmed-by helpers (backed by /api/lookups/filmed-by) ──────────────────
  const addFilmedBy = async () => {
    const trimmed = newFilmedBy.trim();
    if (!trimmed || savingFilmedBy) return;
    if (filmedBy.some((f) => f.name === trimmed)) {
      toast({ title: 'موجود مسبقاً', description: `"${trimmed}" مضاف بالفعل`, variant: 'destructive' });
      return;
    }
    setSavingFilmedBy(true);
    try {
      const created = await settingsService.createFilmedBy(trimmed);
      setFilmedBy((prev) => [...prev, created]);
      setNewFilmedBy('');
      toast({ title: 'تمت الإضافة', description: `تم إضافة "${created.name}"` });
    } catch (err) {
      const msg = (err as ApiError).errors?.name?.[0] ?? (err as ApiError).message ?? 'تعذّر الإضافة';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingFilmedBy(false);
    }
  };

  const removeFilmedBy = async (item: FilmedBy) => {
    try {
      await settingsService.deleteFilmedBy(item.id);
      setFilmedBy((prev) => prev.filter((f) => f.id !== item.id));
      toast({ title: 'تم الحذف', description: `تم حذف "${item.name}"` });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر الحذف';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    }
  };

  // ── Building-status helpers (backed by /api/lookups/building-statuses) ────
  const addBuildingStatus = async () => {
    const trimmed = newBuildingStatus.trim();
    if (!trimmed || savingBuildingStatus) return;
    if (buildingStatuses.some((b) => b.name === trimmed)) {
      toast({ title: 'موجود مسبقاً', description: `"${trimmed}" مضاف بالفعل`, variant: 'destructive' });
      return;
    }
    setSavingBuildingStatus(true);
    try {
      const created = await settingsService.createBuildingStatus(trimmed);
      setBuildingStatuses((prev) => [...prev, created]);
      setNewBuildingStatus('');
      toast({ title: 'تمت الإضافة', description: `تم إضافة "${created.name}"` });
    } catch (err) {
      const msg = (err as ApiError).errors?.name?.[0] ?? (err as ApiError).message ?? 'تعذّر الإضافة';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingBuildingStatus(false);
    }
  };

  const removeBuildingStatus = async (item: BuildingStatus) => {
    try {
      await settingsService.deleteBuildingStatus(item.id);
      setBuildingStatuses((prev) => prev.filter((b) => b.id !== item.id));
      toast({ title: 'تم الحذف', description: `تم حذف "${item.name}"` });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر الحذف';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    }
  };

  // ── Payment-gateway helpers (synced as one list on save) ──────────────────
  const addGateway = () => setGateways(prev => [...prev, blankGateway()]);

  /** Copy an account's fields into a new unsaved row placed right after it. */
  const copyGateway = (uid: number) =>
    setGateways(prev => {
      const index = prev.findIndex(g => g.uid === uid);
      if (index === -1) return prev;
      const copy: GatewayForm = {
        ...prev[index],
        uid: ++gatewayUid,
        id: null,
        name: `${prev[index].name} - نسخة`,
        credentials: { ...prev[index].credentials },
      };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });

  const removeGateway = (uid: number) =>
    setGateways(prev => prev.filter(g => g.uid !== uid));

  const updateGateway = (uid: number, patch: Partial<GatewayForm>) =>
    setGateways(prev => prev.map(g => (g.uid === uid ? { ...g, ...patch } : g)));

  const updateGatewayCredential = (uid: number, field: string, value: string) =>
    setGateways(prev => prev.map(g =>
      g.uid === uid ? { ...g, credentials: { ...g.credentials, [field]: value } } : g
    ));

  /** Persist the whole list — accounts removed here are deleted server-side. */
  const saveGateways = async () => {
    if (gateways.some(g => !g.name.trim())) {
      toast({ title: 'بيانات ناقصة', description: 'أدخل اسماً لكل حساب', variant: 'destructive' });
      return;
    }
    setSavingGateways(true);
    try {
      const saved = await settingsService.savePaymentGateways(
        gateways.map(g => ({
          id: g.id,
          name: g.name.trim(),
          gateway: g.gateway,
          // Send only the selected gateway's own fields, trimmed.
          credentials: Object.fromEntries(
            gatewayFields(g.gateway).map(f => [f.key, (g.credentials[f.key] ?? '').trim()])
          ),
        }))
      );
      setGateways(saved.map(g => ({
        uid: ++gatewayUid,
        id: g.id,
        name: g.name,
        gateway: g.gateway,
        credentials: { ...(g.credentials ?? {}) },
      })));
      toast({ title: 'تم الحفظ', description: 'تم حفظ بوابات الدفع بنجاح' });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر حفظ بوابات الدفع';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSavingGateways(false);
    }
  };

  // ── Unit-type helpers (local only) ────────────────────────────────────────
  const addUnitType = () => {
    const trimmed = newUnitType.trim();
    if (trimmed && !unitTypes.includes(trimmed)) {
      setUnitTypes([...unitTypes, trimmed]);
      setNewUnitType('');
      toast({ title: 'تمت الإضافة', description: `تم إضافة نوع الوحدة "${trimmed}"` });
    }
  };

  const removeUnitType = (ut: string) => {
    setUnitTypes(unitTypes.filter((u) => u !== ut));
    toast({ title: 'تم الحذف', description: `تم حذف نوع الوحدة "${ut}"` });
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
      </div>

      {/* Section 1: Office Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            بيانات المكتب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>اسم المكتب</Label>
              <Input value={officeName} onChange={e => setOfficeName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={officePhone} onChange={e => setOfficePhone(e.target.value)} dir="ltr" placeholder="965-XXXX-XXXX" />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={officeEmail} onChange={e => setOfficeEmail(e.target.value)} dir="ltr" placeholder="info@office.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>وصف النظام</Label>
            <Textarea
              value={officeDescription}
              onChange={e => setOfficeDescription(e.target.value)}
              maxLength={255}
              placeholder="وصف مختصر يظهر عند مشاركة رابط النظام ..."
            />
            <p className="text-xs text-muted-foreground">
              يظهر مع اسم المكتب وشعاره في معاينة الرابط عند مشاركته. يلزم تحديث للنظام
            </p>
          </div>
          <div className="space-y-2">
            <Label>العنوان</Label>
            <Textarea value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} placeholder="عنوان المكتب الكامل..." />
          </div>
          <div className="space-y-2">
            <Label>شعار المكتب</Label>
            <div className="flex items-center gap-4">
              {logoPreview && (
                <img src={logoPreview} alt="شعار المكتب" className="h-16 w-16 object-contain rounded-lg border border-border" />
              )}
              <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors">
                <Upload className="h-4 w-4" />
                <span className="text-sm">رفع شعار</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>أيقونة الموقع (Favicon)</Label>
            <div className="flex items-center gap-4">
              {faviconPreview && (
                // Shown at the size the browser actually renders it in the tab,
                // so an unsuitable image is obvious before saving.
                <span className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40">
                  <img src={faviconPreview} alt="أيقونة الموقع" className="h-4 w-4 object-contain" />
                  <span className="text-sm text-muted-foreground">{officeName || 'نظام إدارة'}</span>
                </span>
              )}
              <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors">
                <Upload className="h-4 w-4" />
                <span className="text-sm">رفع أيقونة</span>
                <input
                  type="file"
                  accept=".ico,image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon"
                  className="hidden"
                  onChange={handleFaviconChange}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              تظهر في تبويب المتصفح. يفضّل صورة مربّعة (32×32 أو 64×64) بصيغة PNG أو ICO، وبحجم أقل من 1 ميجابايت. إن لم تُرفع، يُستخدم شعار المكتب.
            </p>
          </div>
          <Separator />
          <Button onClick={handleSaveOffice} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving
              ? <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              : <Save className="h-4 w-4 ml-2" />}
            حفظ التغييرات
          </Button>
        </CardContent>
      </Card>

      {/* Section 2: Property Categories — one list per listing type */}
      {LOOKUP_SCOPES.map(scope => (
        <LookupListCard
          key={`cats-${scope}`}
          title={`تصنيفات عقارات ${scope === 'إيجار' ? 'الإيجار' : 'البيع'}`}
          icon={<Tags className="h-5 w-5 text-primary" />}
          rows={categories}
          scope={scope}
          draft={newCategory[scope]}
          onDraftChange={value => setNewCategory(prev => ({ ...prev, [scope]: value }))}
          onAdd={() => addCategory(scope)}
          onRemove={cat => removeCategory(cat, scope)}
          saving={savingCategory === scope}
          placeholder="تصنيف جديد..."
          addLabel="إضافة تصنيف"
        />
      ))}

      {/* Section 3: Payment Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            طرق الدفع
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {paymentTypes.map(type => (
              <Badge key={type.id} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
                {type.name}
                <button onClick={() => removePaymentType(type)} className="hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newPaymentType}
              onChange={e => setNewPaymentType(e.target.value)}
              placeholder="طريقة دفع جديدة..."
              onKeyDown={e => e.key === 'Enter' && addPaymentType()}
            />
            <Button onClick={addPaymentType} disabled={savingPaymentType} variant="outline" className="shrink-0">
              <Plus className="h-4 w-4 ml-1" />
              إضافة طريقة دفع
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Payment Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            مدد الدفع
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {paymentTerms.map(term => (
              <Badge key={term.id} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
                {term.name}
                <button onClick={() => removePaymentTerm(term)} className="hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newPaymentTerm}
              onChange={e => setNewPaymentTerm(e.target.value)}
              placeholder="مدة دفع جديدة..."
              onKeyDown={e => e.key === 'Enter' && addPaymentTerm()}
            />
            <Button onClick={addPaymentTerm} disabled={savingPaymentTerm} variant="outline" className="shrink-0">
              <Plus className="h-4 w-4 ml-1" />
              إضافة مدة دفع
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Activities */}
      {/* النشاط — one list per listing type, as with the categories above */}
      {LOOKUP_SCOPES.map(scope => (
        <LookupListCard
          key={`acts-${scope}`}
          title={scope === 'إيجار' ? 'نشاط عقارات الايجار' : 'حالة الاشغال عقارات البيع'}
          icon={<Activity className="h-5 w-5 text-primary" />}
          rows={activities}
          scope={scope}
          draft={newActivity[scope]}
          onDraftChange={value => setNewActivity(prev => ({ ...prev, [scope]: value }))}
          onAdd={() => addActivity(scope)}
          onRemove={activity => removeActivity(activity, scope)}
          saving={savingActivity === scope}
          placeholder={scope === 'إيجار' ? 'نشاط جديد...' : 'حالة اشغال جديدة...'}
          addLabel={scope === 'إيجار' ? 'اضافة نشاط' : 'اضافة حالة اشغال'}
        />
      ))}

      {/* Section 6: Filmed By */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            تم التصوير من قبل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {filmedBy.map(item => (
              <Badge key={item.id} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
                {item.name}
                <button onClick={() => removeFilmedBy(item)} className="hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newFilmedBy}
              onChange={e => setNewFilmedBy(e.target.value)}
              placeholder="اسم جديد..."
              onKeyDown={e => e.key === 'Enter' && addFilmedBy()}
            />
            <Button onClick={addFilmedBy} disabled={savingFilmedBy} variant="outline" className="shrink-0">
              <Plus className="h-4 w-4 ml-1" />
              إضافة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 7: Building Statuses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            حالة البناء
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {buildingStatuses.map(item => (
              <Badge key={item.id} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
                {item.name}
                <button onClick={() => removeBuildingStatus(item)} className="hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newBuildingStatus}
              onChange={e => setNewBuildingStatus(e.target.value)}
              placeholder="حالة جديدة..."
              onKeyDown={e => e.key === 'Enter' && addBuildingStatus()}
            />
            <Button onClick={addBuildingStatus} disabled={savingBuildingStatus} variant="outline" className="shrink-0">
              <Plus className="h-4 w-4 ml-1" />
              إضافة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 8: Payment Gateways */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              بوابات الدفع
            </CardTitle>
            {gateways.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowSecrets(v => !v)} className="shrink-0">
                {showSecrets
                  ? <EyeOff className="h-4 w-4 ml-1" />
                  : <Eye className="h-4 w-4 ml-1" />}
                {showSecrets ? 'إخفاء المفاتيح' : 'إظهار المفاتيح'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {gateways.length === 0 && (
            <p className="text-sm text-muted-foreground">
              لا توجد حسابات مضافة. اضغط "إضافة حساب" لإضافة حساب بوابة دفع.
            </p>
          )}

          {gateways.map((account, index) => (
            <div key={account.uid} className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">حساب #{index + 1}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyGateway(account.uid)}
                    title="نسخ الحساب"
                  >
                    <Copy className="h-4 w-4 ml-1" />
                    نسخ
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGateway(account.uid)}
                    title="حذف الحساب"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 ml-1" />
                    حذف
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم الحساب</Label>
                  <Input
                    value={account.name}
                    onChange={e => updateGateway(account.uid, { name: e.target.value })}
                    placeholder="مثال: الحساب الرئيسي"
                  />
                </div>
                <div className="space-y-2">
                  <Label>بوابة الدفع</Label>
                  <Select
                    value={account.gateway}
                    onValueChange={value => updateGateway(account.uid, { gateway: value as PaymentProvider })}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر البوابة" /></SelectTrigger>
                    <SelectContent>
                      {GATEWAYS.map(g => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {gatewayFields(account.gateway).map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input
                      dir="ltr"
                      type={field.secret && !showSecrets ? 'password' : 'text'}
                      value={account.credentials[field.key] ?? ''}
                      onChange={e => updateGatewayCredential(account.uid, field.key, e.target.value)}
                      placeholder={field.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Button onClick={addGateway} variant="outline" className="w-full">
            <Plus className="h-4 w-4 ml-1" />
            إضافة حساب
          </Button>

          <Separator />
          <Button onClick={saveGateways} disabled={savingGateways} className="bg-primary hover:bg-primary/90">
            {savingGateways
              ? <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              : <Save className="h-4 w-4 ml-2" />}
            حفظ بوابات الدفع
          </Button>
        </CardContent>
      </Card>

    </div>
  );
};

export default SettingsPage;
