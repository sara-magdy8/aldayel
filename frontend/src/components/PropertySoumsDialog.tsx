import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { Property } from '@/types';
import { ApiError } from '@/services/api';
import { Soum, SoumFormData, SoumType, SOUM_TYPES, SOUM_TYPE_INDIRECT, soumsService } from '@/services/soums';

interface PropertySoumsDialogProps {
  /** The listing whose bids are shown; null keeps the dialog closed. */
  property: Property | null;
  onClose: () => void;
  /**
   * Fired on close, and only if a bid was actually added, edited or removed —
   * the list row behind shows a count and a highest bid that this dialog can
   * invalidate. Deferring to close keeps the list from reloading under the
   * dialog on every keystroke of work.
   */
  onChanged?: () => void;
}

/** A blank form — the date defaults to today, the common case when logging a bid. */
const emptyForm = (): SoumFormData => ({
  bidder_name: '',
  soum_date: new Date().toISOString().slice(0, 10),
  amount: 0,
  soum_type: 'مباشر',
  broker_name: '',
  broker_phone: '',
});

/** Prefill the form from an existing bid for editing. */
const formFromSoum = (soum: Soum): SoumFormData => ({
  bidder_name: soum.bidder_name,
  soum_date: soum.soum_date,
  amount: soum.amount,
  soum_type: soum.soum_type,
  broker_name: soum.broker_name ?? '',
  broker_phone: soum.broker_phone ?? '',
});

/**
 * السوم — the bids on one property: listed, added, edited and deleted without
 * leaving the dialog. The list and the form share the dialog body — the form
 * replaces the list while it is open, so no second dialog is ever nested.
 */
const PropertySoumsDialog: React.FC<PropertySoumsDialogProps> = ({ property, onClose, onChanged }) => {
  const [soums, setSoums] = useState<Soum[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // null = list view; otherwise the form is open on a new (id undefined) or an existing bid.
  const [editing, setEditing] = useState<{ id?: string; data: SoumFormData } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Whether this session changed anything, so close knows to refresh the row.
  const dirty = useRef(false);

  const propertyId = property?.id;

  /** Close, telling the caller to reload only if there is something to reload. */
  const handleClose = () => {
    if (dirty.current) onChanged?.();
    onClose();
  };

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      setSoums(await soumsService.list(propertyId));
    } catch {
      toast.error('فشل تحميل السوم');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  // Reload on every open, and drop any half-filled form left from the previous one.
  useEffect(() => {
    if (!propertyId) return;
    setEditing(null);
    dirty.current = false;
    load();
  }, [propertyId, load]);

  const isIndirect = editing?.data.soum_type === SOUM_TYPE_INDIRECT;

  // Every field is required; the broker pair only exists for a غير مباشر bid.
  const canSave = !!editing
    && !!editing.data.bidder_name.trim()
    && !!editing.data.soum_date
    && editing.data.amount > 0
    && (!isIndirect || (!!editing.data.broker_name?.trim() && !!editing.data.broker_phone?.trim()))
    && !saving;

  const updateField = <K extends keyof SoumFormData>(key: K, value: SoumFormData[K]) =>
    setEditing(prev => (prev ? { ...prev, data: { ...prev.data, [key]: value } } : prev));

  const handleSave = async () => {
    if (!canSave || !editing || !propertyId) return;
    setSaving(true);
    try {
      // Broker data belongs to غير مباشر only. The backend clears it too, but
      // sending it would leave the two sides disagreeing on what was saved.
      const payload: SoumFormData = {
        ...editing.data,
        bidder_name: editing.data.bidder_name.trim(),
        broker_name: isIndirect ? editing.data.broker_name?.trim() : undefined,
        broker_phone: isIndirect ? editing.data.broker_phone?.trim() : undefined,
      };

      if (editing.id) {
        await soumsService.update(editing.id, payload);
        toast.success('تم تعديل السوم بنجاح');
      } else {
        await soumsService.create(propertyId, payload);
        toast.success('تم إضافة السوم بنجاح');
      }
      dirty.current = true;
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as ApiError)?.message ?? 'فشل حفظ السوم');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await soumsService.remove(deleteId);
      toast.success('تم حذف السوم بنجاح');
      dirty.current = true;
      setSoums(prev => prev.filter(s => s.id !== deleteId));
    } catch (e) {
      toast.error((e as ApiError)?.message ?? 'فشل حذف السوم');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <Dialog open={!!property} onOpenChange={(open) => !open && handleClose()}>
        {/* The close ✕ is pinned to right-4 inside DialogContent and takes no
            prop, so it is moved from here. `&>button` reaches it without
            touching the body's buttons, which all sit deeper. */}
        <DialogContent
          dir="rtl"
          className="max-w-3xl max-h-[90vh] overflow-y-auto [&>button]:right-auto [&>button]:left-4"
        >
          <DialogHeader className="text-right sm:text-right border-b pb-4">
            <DialogTitle>سومات العقار</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-0.5">
                <div>كود العقار: {property?.property_code || '—'}</div>
                <div>المالك: {property?.owner_name || '—'}</div>
              </div>
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="soum-bidder">اسم السوام *</Label>
                  <Input
                    id="soum-bidder"
                    value={editing.data.bidder_name}
                    onChange={e => updateField('bidder_name', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="soum-date">التاريخ *</Label>
                  <Input
                    id="soum-date"
                    type="date"
                    value={editing.data.soum_date}
                    onChange={e => updateField('soum_date', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="soum-amount">مبلغ السوم (د.ك) *</Label>
                  <Input
                    id="soum-amount"
                    type="number"
                    min={0}
                    step="0.001"
                    dir="ltr"
                    className="text-left"
                    value={editing.data.amount || ''}
                    onChange={e => updateField('amount', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>نوع السوم *</Label>
                  <RadioGroup
                    value={editing.data.soum_type}
                    onValueChange={v => updateField('soum_type', v as SoumType)}
                    className="flex items-center gap-6 pt-2"
                  >
                    {SOUM_TYPES.map((t, i) => (
                      <div key={t} className="flex items-center gap-2">
                        <RadioGroupItem value={t} id={`soum-type-${i}`} />
                        <Label htmlFor={`soum-type-${i}`} className="cursor-pointer font-normal">{t}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>

              {/* الوسيط only exists for a غير مباشر bid. */}
              {isIndirect && (
                <div className="grid gap-4 md:grid-cols-2 rounded-md border bg-muted/50 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="soum-broker-name">اسم الوسيط *</Label>
                    <Input
                      id="soum-broker-name"
                      value={editing.data.broker_name ?? ''}
                      onChange={e => updateField('broker_name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soum-broker-phone">رقم هاتف الوسيط *</Label>
                    <Input
                      id="soum-broker-phone"
                      dir="ltr"
                      className="text-left"
                      value={editing.data.broker_phone ?? ''}
                      onChange={e => updateField('broker_phone', e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>إلغاء</Button>
                <Button onClick={handleSave} disabled={!canSave}>
                  {saving ? 'جاري الحفظ...' : editing.id ? 'حفظ التعديل' : 'إضافة'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {loading ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Loader2 className="animate-spin mx-auto" size={28} />
                </div>
              ) : soums.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  {/* Dimmed icon over the message, as on the placeholder page. */}
                  <Tag size={48} className="mx-auto mb-3 opacity-40" />
                  لا يوجد سوم
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>اسم السوام</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>نوع السوم</TableHead>
                        <TableHead>الوسيط</TableHead>
                        <TableHead>الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {soums.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.bidder_name}</TableCell>
                          <TableCell>{formatDate(s.soum_date)}</TableCell>
                          <TableCell>{s.amount.toLocaleString()} د.ك</TableCell>
                          <TableCell>
                            <Badge variant={s.soum_type === SOUM_TYPE_INDIRECT ? 'secondary' : 'default'}>
                              {s.soum_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {s.broker_name
                              ? <span>{s.broker_name}{s.broker_phone ? ` — ${s.broker_phone}` : ''}</span>
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="تعديل"
                                onClick={() => setEditing({ id: s.id, data: formFromSoum(s) })}
                              >
                                <Pencil size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="حذف"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteId(s.id)}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Sits under the list so it reads as "and one more" after whatever
                  is already there. `outline` rather than a hard-coded bg-white:
                  it resolves to the surface colour, so it stays white in the
                  light theme without going white-on-white in the dark one. */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setEditing({ data: emptyForm() })}
              >
                <Plus size={18} />
                اضافة سوم
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا السوم؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          {/* space-x-* is physical: in RTL its margin lands outside the pair and
              the two buttons end up touching. gap keeps them apart either way. */}
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PropertySoumsDialog;
