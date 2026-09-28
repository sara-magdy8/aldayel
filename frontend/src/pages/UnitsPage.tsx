import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Plus, Eye, Pencil, Link2, Trash2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Unit, UnitStatus, ListingType } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { unitsService, UnitFormData, UnitImageDto } from '@/services/units';
import { apiClient, ApiError } from '@/services/api';

const unitStatusColors: Record<string, string> = {
  'متاح': 'bg-green-100 text-green-800',
  'محجوز': 'bg-amber-100 text-amber-800',
  'مؤجر': 'bg-blue-100 text-blue-800',
  'مباع': 'bg-gray-100 text-gray-800',
};

// Minimal property shape needed from the show endpoint
interface PropertySummary {
  id: string;
  name: string;
  /** Prefixed onto each unit number on the cards, e.g. "12345/12". */
  plot_number: string;
  listing_type: ListingType;
  // Seeded into a new unit's form as its starting values — a unit usually
  // inherits its property's النشاط / المساحة / السعر, and the few that differ
  // get edited in place. Editing an existing unit never re-applies these.
  activities: string[];
  area?: number;
  /** إيجار properties hold the amount in rent_amount, بيع ones in price. */
  price?: number;
}

const UnitsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // The properties list hands us its page + filters on the way in; we hand the
  // same snapshot back so its "العودة" button reopens the list where it was.
  // A direct visit (no state) simply returns to a fresh list.
  const { state: listState } = useLocation();

  // Option lists from the backend lookup tables (units link to property_statuses / activities).
  const { propertyStatuses: unitStatuses, activitiesFor } = useLookups();

  // ── Property info ────────────────────────────────────────────────────────
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiClient.get<Record<string, unknown>>(`/properties/${id}`)
      .then(data => setProperty({
        id: String(data.id),
        name: String(data.name),
        plot_number: data.plot_number ? String(data.plot_number) : '',
        listing_type: data.listing_type as ListingType,
        activities: Array.isArray(data.activities) ? data.activities.map(String) : [],
        area: data.area != null ? Number(data.area) : undefined,
        price: data.rent_amount != null
          ? Number(data.rent_amount)
          : data.price != null ? Number(data.price) : undefined,
      }))
      .catch(() => setProperty(null))
      .finally(() => setPropertyLoading(false));
  }, [id]);

  // ── Units list ───────────────────────────────────────────────────────────
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchUnits = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await unitsService.list(id);
      setUnits(data);
    } catch {
      toast.error('تعذّر تحميل قائمة الوحدات');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // ── Dialogs / form state ─────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [viewUnit, setViewUnit] = useState<Unit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<Partial<Unit>>({});
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<UnitImageDto[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // How many units the add form creates in one go; edit mode always touches one.
  const [unitCount, setUnitCount] = useState(1);

  /**
   * Starts the add form off with the property's own النشاط / المساحة / السعر so
   * the usual case needs no typing; all three stay editable, and a property
   * that has none of them just leaves the field blank as before.
   */
  const resetForm = (unitNumber = '') => setForm({
    unit_number: unitNumber,
    activities: property?.activities ?? [],
    floor: '',
    area: property?.area,
    rooms_count: undefined,
    price: property?.price,
    // نوع العرض is the property's, not the unit's own — a unit under a عقار
    // إيجار is offered for rent and one under a عقار بيع for sale, so the form
    // no longer asks and simply carries the property's value through.
    listing_type: property?.listing_type ?? 'إيجار',
    status: 'متاح',
    notes: '',
    description: '',
    conditions: '',
    grace_period: '',
  });

  /**
   * Where the add form starts numbering: one past the largest number already
   * used by this property's units, so a new run continues the sequence. Reads
   * the loaded list, which holds every unit of the property (the endpoint is
   * not paginated). Falls back to 1 when the property has no units yet.
   */
  const nextUnitNumber = useMemo(() => {
    const highest = units.reduce((max, u) => {
      const digits = String(u.unit_number ?? '').match(/\d+/g);
      // Trailing group, so "مبنى 2 - وحدة 14" continues from 14 rather than 2.
      return digits ? Math.max(max, Number(digits[digits.length - 1])) : max;
    }, 0);
    return highest + 1;
  }, [units]);

  /**
   * Numbers already taken in this property. The unit being edited is excluded
   * so re-saving it without renaming does not collide with itself. The backend
   * enforces the same rule; this only avoids creating part of a run first.
   */
  const takenUnitNumbers = useMemo(
    () => new Set(units.filter(u => u.id !== editingUnit?.id).map(u => String(u.unit_number).trim())),
    [units, editingUnit],
  );

  /** The unit numbers the form would write, in order. */
  const plannedUnitNumbers = useMemo(() => {
    const typed = (form.unit_number || '').trim();
    if (!typed) return [];
    if (editingUnit || unitCount === 1) return [typed];

    const start = Number(typed);
    if (!Number.isInteger(start)) return [];
    return Array.from({ length: unitCount }, (_, i) => String(start + i));
  }, [form.unit_number, unitCount, editingUnit]);

  const duplicateUnitNumbers = useMemo(
    () => plannedUnitNumbers.filter(n => takenUnitNumbers.has(n)),
    [plannedUnitNumbers, takenUnitNumbers],
  );

  const openAdd = () => {
    resetForm(String(nextUnitNumber));
    setUnitCount(1);
    setSelectedImages([]);
    setExistingImages([]);
    setEditingUnit(null);
    setFormOpen(true);
  };

  const openEdit = async (unit: Unit) => {
    setForm({ ...unit });
    setSelectedImages([]);
    setExistingImages([]);
    setEditingUnit(unit);
    setFormOpen(true);
    // Load the unit's persisted images (with ids) so they can be previewed/removed.
    setImagesLoading(true);
    try {
      setExistingImages(await unitsService.getImages(unit.id));
    } catch {
      // Non-critical: the form still works for field edits and new uploads.
    } finally {
      setImagesLoading(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!editingUnit) return;
    setDeletingImageId(imageId);
    try {
      await unitsService.deleteImage(editingUnit.id, imageId);
      setExistingImages(prev => prev.filter(img => img.id !== imageId));
      // Keep the unit in the grid consistent with the removal.
      setUnits(prev => prev.map(u => u.id === editingUnit.id
        ? { ...u, images: u.images.filter(url => !existingImages.find(i => i.id === imageId && i.url === url)) }
        : u));
      toast.success('تم حذف الصورة');
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.message || 'تعذّر حذف الصورة');
    } finally {
      setDeletingImageId(null);
    }
  };

  const handleSave = async () => {
    if (!id) return;

    const unitNumber = (form.unit_number || '').trim();
    if (!unitNumber) {
      toast.error('رقم الوحدة مطلوب');
      return;
    }

    // Checked up front so a run cannot be created halfway before hitting the
    // duplicate. The backend rejects them too; this just fails earlier and says
    // exactly which numbers clash.
    if (duplicateUnitNumbers.length) {
      toast.error(duplicateUnitNumbers.length === 1
        ? `رقم الوحدة ${duplicateUnitNumbers[0]} مستخدم بالفعل في هذا العقار`
        : `هذه الأرقام مستخدمة بالفعل في هذا العقار: ${duplicateUnitNumbers.join('، ')}`);
      return;
    }

    // Always the property's نوع العرض; the form has no field for it.
    const listingType: ListingType = property?.listing_type ?? 'إيجار';

    // Everything except the number, which varies per unit when creating a run.
    // The free-text fields go out as '' rather than undefined so emptying one
    // in the edit form actually clears it — an omitted key leaves it as it was.
    const base = {
      activities: form.activities ?? [],
      floor: form.floor || undefined,
      area: form.area,
      rooms_count: form.rooms_count,
      price: form.price,
      listing_type: listingType,
      status: (form.status as UnitStatus) || 'متاح',
      notes: form.notes || undefined,
      description: form.description ?? '',
      conditions: form.conditions ?? '',
      // فترة السماح only applies to rentals; a sale unit always sends it empty.
      grace_period: listingType === 'إيجار' ? (form.grace_period ?? '') : '',
    };

    if (editingUnit) {
      setSubmitting(true);
      try {
        const payload: UnitFormData = { ...base, unit_number: unitNumber };
        const updated = await unitsService.update(editingUnit.id, payload, selectedImages);
        setUnits(prev => prev.map(u => u.id === updated.id ? updated : u));
        toast.success('تم تعديل الوحدة');
        setFormOpen(false);
        setEditingUnit(null);
      } catch (e) {
        toast.error((e as ApiError).message || 'حدث خطأ أثناء الحفظ');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // A single unit keeps whatever was typed, so non-numeric names stay usable.
    // A run has to count upward from it, which only works for a plain number.
    const start = Number(unitNumber);
    if (unitCount > 1 && !Number.isInteger(start)) {
      toast.error('لإضافة أكثر من وحدة يجب أن يكون رقم الوحدة رقماً صحيحاً');
      return;
    }

    // Sent one at a time so the numbering stays ordered and a failure part-way
    // through can report exactly how many units were created.
    const created: Unit[] = [];
    setSubmitting(true);
    try {
      for (let i = 0; i < unitCount; i++) {
        const payload: UnitFormData = {
          ...base,
          unit_number: unitCount === 1 ? unitNumber : String(start + i),
        };
        created.push(await unitsService.create(id, payload, selectedImages));
      }
      toast.success(unitCount === 1 ? 'تم إضافة الوحدة' : `تم إضافة ${created.length} وحدة`);
      setFormOpen(false);
    } catch (e) {
      const message = (e as ApiError).message || 'حدث خطأ أثناء الحفظ';
      toast.error(created.length
        ? `تم إضافة ${created.length} من ${unitCount} وحدة ثم توقفت العملية — ${message}`
        : message);
    } finally {
      if (created.length) setUnits(prev => [...prev, ...created]);
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setSubmitting(true);
    try {
      await unitsService.remove(deleteId);
      setUnits(prev => prev.filter(u => u.id !== deleteId));
      toast.success('تم حذف الوحدة');
      setDeleteId(null);
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.message || 'تعذّر حذف الوحدة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/view/${token}`);
    toast.success('تم نسخ الرابط');
  };

  const applyUnitLocally = (updated: Unit) => {
    setUnits(prev => prev.map(u => u.id === updated.id ? updated : u));
    setViewUnit(updated);
  };

  // Toggle the public link — optimistic, reverts on failure.
  const handleToggleLink = async (unit: Unit) => {
    const optimistic = { ...unit, public_link_enabled: !unit.public_link_enabled };
    applyUnitLocally(optimistic);
    try {
      const res = await unitsService.toggleLink(unit.id);
      applyUnitLocally({ ...optimistic, public_link_enabled: res.public_link_enabled });
      toast.success(res.public_link_enabled ? 'تم تفعيل الرابط' : 'تم إلغاء تفعيل الرابط');
    } catch (e) {
      applyUnitLocally(unit);
      toast.error((e as ApiError).message || 'تعذّر تحديث حالة الرابط');
    }
  };

  // Persist a single public_show_* flag — optimistic, reverts on failure.
  const handleLinkSetting = async (unit: Unit, partial: Partial<Unit>) => {
    applyUnitLocally({ ...unit, ...partial });
    try {
      await unitsService.linkSettings(unit.id, partial);
      toast.success('تم تحديث إعدادات العرض');
    } catch (e) {
      applyUnitLocally(unit);
      toast.error((e as ApiError).message || 'تعذّر حفظ الإعدادات');
    }
  };

  // ── Guard states ─────────────────────────────────────────────────────────
  if (propertyLoading) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin mx-auto" size={32} />
      </div>
    );
  }

  if (!property) {
    return <div className="text-center py-20 text-muted-foreground">العقار غير موجود</div>;
  }

  const backPath = property.listing_type === 'إيجار' ? '/properties/rent' : '/properties/sale';
  const backLabel = property.listing_type === 'إيجار' ? 'العودة لعقارات الإيجار' : 'العودة لعقارات البيع';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <Button variant="ghost" onClick={() => navigate(backPath, { state: listState })} className="gap-2 mb-2 -mr-4">
            <ArrowRight size={18} />
            {backLabel}
          </Button>
          <h2 className="text-xl font-bold text-foreground">إدارة الوحدات — {property.name}</h2>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={openAdd} className="gap-2 flex-1 sm:flex-initial">
            <Plus size={18} />
            إضافة وحدة / وحدات
          </Button>
        </div>
      </div>

      {/* Units Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin mx-auto" size={28} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {units.map(unit => (
            <Card key={unit.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  {/* dir="ltr" keeps "12345/12" in that order — in an RTL block the
                      bidi algorithm can otherwise flip the two sides of the slash.
                      The heading hugs its content as a flex item, so forcing LTR
                      does not move it. */}
                  <h3 className="font-bold text-lg" dir="ltr">
                    {property.plot_number ? `${property.plot_number} / ${unit.unit_number}` : unit.unit_number}
                  </h3>
                  <Badge variant="secondary" className={unitStatusColors[unit.status]}>{unit.status}</Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground mb-4">
                  <p>{unit.activity || '-'} | {unit.floor || '-'}</p>
                  <p>{unit.area ? `${unit.area} م²` : '-'} | {unit.rooms_count ? `${unit.rooms_count} غرف` : '-'}</p>
                  <p className="font-medium text-foreground">{unit.price ? `${unit.price} د.ك` : '-'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setViewUnit(unit)}><Eye size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(unit)}><Pencil size={14} /></Button>
                  {unit.public_link_enabled && (
                    <Button variant="ghost" size="sm" onClick={() => handleCopyLink(unit.public_link_token)}><Link2 size={14} /></Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(unit.id)} className="text-destructive hover:text-destructive"><Trash2 size={14} /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {units.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">لا توجد وحدات — أضف وحدة جديدة</div>
          )}
        </div>
      )}

      {/* Add/Edit Unit Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingUnit(null); }}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingUnit ? 'تعديل وحدة' : unitCount > 1 ? `إضافة ${unitCount} وحدات` : 'إضافة وحدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 -mx-6 px-6">
            <div>
              <Label>{!editingUnit && unitCount > 1 ? 'رقم الوحدة الابتدائي *' : 'رقم الوحدة *'}</Label>
              <Input
                value={form.unit_number || ''}
                onChange={e => setForm(p => ({ ...p, unit_number: e.target.value }))}
                className={duplicateUnitNumbers.length ? 'border-destructive focus-visible:ring-destructive' : undefined}
              />
              {duplicateUnitNumbers.length > 0 && (
                <p className="text-xs text-destructive mt-1">
                  {duplicateUnitNumbers.length === 1
                    ? `رقم الوحدة ${duplicateUnitNumbers[0]} مستخدم بالفعل في هذا العقار`
                    : `أرقام مستخدمة بالفعل في هذا العقار: ${duplicateUnitNumbers.join('، ')}`}
                </p>
              )}
            </div>
            {!editingUnit && (
              <div>
                <Label>عدد الوحدات *</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={unitCount}
                  onChange={e => setUnitCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                />
                {unitCount > 1 && (
                  Number.isInteger(Number((form.unit_number || '').trim())) && (form.unit_number || '').trim() !== '' ? (
                    <p className="text-xs text-muted-foreground mt-1" dir="rtl">
                      سيتم إنشاء الوحدات بالأرقام من {Number(form.unit_number)} إلى {Number(form.unit_number) + unitCount - 1}
                    </p>
                  ) : (
                    <p className="text-xs text-destructive mt-1">لإضافة أكثر من وحدة يجب أن يكون رقم الوحدة رقماً صحيحاً</p>
                  )
                )}
              </div>
            )}
            <div>
              <Label>النشاط</Label>
              <MultiSearchableSelect
                className="w-full mt-1"
                placeholder="اختر نشاطاً أو أكثر"
                value={form.activities || []}
                onValueChange={v => setForm(p => ({ ...p, activities: v }))}
                // النشاط follows the property the units belong to: units of a عقار
                // بيع pick from the sale list, everything else from the rental one.
                // Not the unit's own نوع العرض — that only says how this unit is
                // offered, and switching it must not swap the list underneath.
                options={activitiesFor(property.listing_type)}
              />
            </div>
            <div><Label>الطابق</Label><Input value={form.floor || ''} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} /></div>
            <div>
              <Label>المساحة</Label>
              <div className="flex items-center gap-2"><Input type="number" value={form.area || ''} onChange={e => setForm(p => ({ ...p, area: e.target.value ? Number(e.target.value) : undefined }))} /><span className="text-sm text-muted-foreground">م²</span></div>
            </div>
            <div><Label>عدد الغرف</Label><Input type="number" value={form.rooms_count || ''} onChange={e => setForm(p => ({ ...p, rooms_count: e.target.value ? Number(e.target.value) : undefined }))} /></div>
            <div>
              <Label>السعر *</Label>
              <div className="flex items-center gap-2"><Input type="number" value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: e.target.value ? Number(e.target.value) : undefined }))} /><span className="text-sm text-muted-foreground">د.ك</span></div>
            </div>
            <div>
              <Label>الحالة *</Label>
              <Select value={form.status || 'متاح'} onValueChange={v => setForm(p => ({ ...p, status: v as UnitStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{unitStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>الملاحظات</Label><Textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
            <div>
              <Label>المواصفات</Label>
              <Textarea value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div>
              <Label>الشروط</Label>
              <Textarea value={form.conditions || ''} onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))} rows={2} />
            </div>
            {/* فترة السماح — إيجار فقط، تبعاً لنوع عرض العقار */}
            {property.listing_type === 'إيجار' && (
              <div>
                <Label>فترة السماح</Label>
                <Input value={form.grace_period || ''} onChange={e => setForm(p => ({ ...p, grace_period: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>الصور</Label>

              {/* Existing images (edit only) — each removable */}
              {editingUnit && (
                imagesLoading ? (
                  <div className="py-3 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={18} /></div>
                ) : existingImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {existingImages.map(img => (
                      <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border">
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          disabled={deletingImageId === img.id}
                          className="absolute top-1 left-1 bg-destructive/90 text-destructive-foreground rounded-full p-1 hover:bg-destructive disabled:opacity-50"
                          aria-label="حذف الصورة"
                        >
                          {deletingImageId === img.id ? <Loader2 className="animate-spin" size={12} /> : <X size={12} />}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => setSelectedImages(e.target.files ? Array.from(e.target.files) : [])}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) setSelectedImages(Array.from(e.dataTransfer.files)); }}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              >
                {selectedImages.length > 0
                  ? `تم اختيار ${selectedImages.length} ${selectedImages.length === 1 ? 'صورة' : 'صور'}`
                  : 'اسحب الصور هنا أو انقر للاختيار'}
              </div>
              {editingUnit && (
                <p className="text-xs text-muted-foreground mt-1">الصور الجديدة تُضاف إلى الصور الحالية عند الحفظ.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={submitting || duplicateUnitNumbers.length > 0}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : 'حفظ'}
            </Button>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={submitting}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Unit Sheet */}
      <Sheet open={!!viewUnit} onOpenChange={(o) => !o && setViewUnit(null)}>
        <SheetContent side="right" className="w-[420px] max-w-full p-0 h-dvh flex flex-col gap-0">
          {viewUnit && (
            <>
              <SheetHeader className="p-6 pb-0 shrink-0">
                <SheetTitle className="flex items-center gap-3">
                  {viewUnit.unit_number}
                  <Badge variant="secondary" className={unitStatusColors[viewUnit.status]}>{viewUnit.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="flex-1 min-h-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="space-y-1">
                  {/* <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">نوع الوحدة</span><span className="text-sm font-medium">{viewUnit.unit_type || '-'}</span></div> */}
                  <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">النشاط</span><span className="text-sm font-medium">{viewUnit.activity || '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">الطابق</span><span className="text-sm font-medium">{viewUnit.floor || '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">المساحة</span><span className="text-sm font-medium">{viewUnit.area ? `${viewUnit.area} م²` : '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">عدد الغرف</span><span className="text-sm font-medium">{viewUnit.rooms_count || '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">السعر</span><span className="text-sm font-medium">{viewUnit.price ? `${viewUnit.price} د.ك` : '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">نوع العرض</span><span className="text-sm font-medium">{viewUnit.listing_type}</span></div>
                  {viewUnit.listing_type === 'إيجار' && viewUnit.grace_period && (
                    <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">فترة السماح</span><span className="text-sm font-medium">{viewUnit.grace_period}</span></div>
                  )}
                  {viewUnit.notes && <div className="flex justify-between py-2"><span className="text-muted-foreground text-sm">الملاحظات</span><span className="text-sm font-medium">{viewUnit.notes}</span></div>}
                  {viewUnit.description && <div className="flex justify-between gap-4 py-2"><span className="text-muted-foreground text-sm shrink-0">المواصفات</span><span className="text-sm font-medium whitespace-pre-line">{viewUnit.description}</span></div>}
                  {viewUnit.conditions && <div className="flex justify-between gap-4 py-2"><span className="text-muted-foreground text-sm shrink-0">الشروط</span><span className="text-sm font-medium whitespace-pre-line">{viewUnit.conditions}</span></div>}
                </div>

                {/* Attachments — the unit's images, already loaded with the list
                    (UnitController@index eager-loads them), so no extra request.
                    Each opens full size in a new tab. */}
                <Separator className="my-4" />
                <h4 className="font-bold text-sm mb-3">المرفقات</h4>
                {viewUnit.images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {viewUnit.images.map((src, i) => (
                      <a
                        key={i}
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                      >
                        <img
                          src={src}
                          alt={`${viewUnit.unit_number} — مرفق ${i + 1}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا توجد مرفقات لهذه الوحدة</p>
                )}

                <Separator className="my-4" />
                <h4 className="font-bold text-sm mb-3">إعدادات رابط المشاهدة</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>تفعيل الرابط</Label>
                    <Switch checked={viewUnit.public_link_enabled} onCheckedChange={() => handleToggleLink(viewUnit)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={viewUnit.public_show_price} onCheckedChange={(c) => handleLinkSetting(viewUnit, { public_show_price: !!c })} id="u-price" />
                    <Label htmlFor="u-price" className="cursor-pointer">عرض السعر</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={viewUnit.public_show_location} onCheckedChange={(c) => handleLinkSetting(viewUnit, { public_show_location: !!c })} id="u-loc" />
                    <Label htmlFor="u-loc" className="cursor-pointer">عرض الموقع</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={viewUnit.public_show_contact} onCheckedChange={(c) => handleLinkSetting(viewUnit, { public_show_contact: !!c })} id="u-contact" />
                    <Label htmlFor="u-contact" className="cursor-pointer">عرض رقم التواصل</Label>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">الرابط</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={`${window.location.origin}/view/${viewUnit.public_link_token}`} readOnly className="text-xs" />
                      <Button variant="outline" size="icon" onClick={() => handleCopyLink(viewUnit.public_link_token)}><Copy size={16} /></Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذه الوحدة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {submitting ? <Loader2 className="animate-spin" size={16} /> : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UnitsPage;
