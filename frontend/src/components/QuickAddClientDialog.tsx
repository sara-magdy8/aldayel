import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Client, ClientType } from '@/types';
import { CLIENT_TYPES } from '@/lib/clientTypes';
import { clientsService } from '@/services/clients';

interface QuickAddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientAdded: (client: Client) => void;
  /** نوع العميل المبدئي — set by the field that opened the dialog (المالك / الوسيط / مسؤول العقار). */
  defaultType?: ClientType;
}

const QuickAddClientDialog: React.FC<QuickAddClientDialogProps> = ({ open, onOpenChange, onClientAdded, defaultType = 'فرد' }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<ClientType>(defaultType);
  const [repName, setRepName] = useState('');
  const [repPhone, setRepPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // The dialog instance is kept mounted across opens, so the initial state above
  // only applies once — re-apply the caller's type each time it reopens.
  useEffect(() => {
    if (open) setType(defaultType);
  }, [open, defaultType]);

  const isCompany = type === 'شركة';
  const canSave = !!name && !!phone && !saving
    && (!isCompany || (!!repName && !!repPhone));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const newClient = await clientsService.create({
        full_name: name,
        phone,
        email: email || undefined,
        type,
        // Representative data belongs to companies only — drop it for any other type.
        company_rep_name: isCompany ? repName : undefined,
        company_rep_phone: isCompany ? repPhone : undefined,
        status: 'نشط',
      });
      onClientAdded(newClient);
      toast.success('تم إضافة العميل بنجاح');
      setName(''); setPhone(''); setEmail(''); setType(defaultType); setRepName(''); setRepPhone('');
      onOpenChange(false);
    } catch {
      toast.error('فشل إضافة العميل');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إضافة عميل جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>الاسم الكامل *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>رقم الهاتف *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className="text-left" />
          </div>
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" className="text-left" />
          </div>
          <div>
            <Label>نوع العميل *</Label>
            <RadioGroup
              value={type}
              onValueChange={v => setType(v as ClientType)}
              className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2"
            >
              {CLIENT_TYPES.map((t, i) => (
                <div key={t} className="flex items-center gap-2">
                  <RadioGroupItem value={t} id={`q-type-${i}`} />
                  <Label htmlFor={`q-type-${i}`} className="cursor-pointer">{t}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {isCompany && (
            <div className="space-y-4 rounded-md border bg-muted/50 p-3">
              <p className="text-sm font-medium">بيانات ممثل الشركة</p>
              <div>
                <Label>اسم ممثل الشركة *</Label>
                <Input value={repName} onChange={e => setRepName(e.target.value)} />
              </div>
              <div>
                <Label>رقم هاتف الممثل *</Label>
                <Input value={repPhone} onChange={e => setRepPhone(e.target.value)} dir="ltr" className="text-left" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={!canSave}>{saving ? 'جاري الحفظ...' : 'إضافة'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddClientDialog;
