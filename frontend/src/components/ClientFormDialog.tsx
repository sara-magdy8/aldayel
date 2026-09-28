import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Client, ClientType } from '@/types';
import { CLIENT_TYPES } from '@/lib/clientTypes';

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSave: (client: Client) => void;
}

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', type: 'فرد' as ClientType, notes: '',
  company_rep_name: '', company_rep_phone: '',
  // الحالة — stored as 1/0 on the backend, carried here as the label the API expects.
  status: 'نشط' as Client['status'],
};

const ClientFormDialog: React.FC<ClientFormDialogProps> = ({ open, onOpenChange, client, onSave }) => {
  const isEdit = !!client;
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (client) {
      setForm({
        full_name: client.full_name, phone: client.phone, email: client.email || '',
        type: client.type, notes: client.notes || '',
        company_rep_name: client.company_rep_name || '',
        company_rep_phone: client.company_rep_phone || '',
        status: client.status,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [client, open]);

  const isCompany = form.type === 'شركة';
  const canSave = !!form.full_name && !!form.phone
    && (!isCompany || (!!form.company_rep_name && !!form.company_rep_phone));

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: client?.id || `c-${Date.now()}`,
      full_name: form.full_name,
      phone: form.phone,
      email: form.email || undefined,
      type: form.type,
      // Representative data belongs to companies only — drop it for any other type.
      company_rep_name: isCompany ? form.company_rep_name : undefined,
      company_rep_phone: isCompany ? form.company_rep_phone : undefined,
      notes: form.notes || undefined,
      status: form.status,
      created_at: client?.created_at || new Date().toISOString().split('T')[0],
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>نوع العميل *</Label>
            <RadioGroup
              value={form.type}
              onValueChange={v => setForm(f => ({ ...f, type: v as ClientType }))}
              className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2"
            >
              {CLIENT_TYPES.map((t, i) => (
                <div key={t} className="flex items-center gap-2">
                  <RadioGroupItem value={t} id={`cf-type-${i}`} />
                  <Label htmlFor={`cf-type-${i}`} className="cursor-pointer">{t}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            {isCompany ? <Label> اسم الشركة *</Label> : <Label>الاسم الكامل *</Label>}
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <Label>رقم الهاتف *</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" className="text-left" />
          </div>
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} dir="ltr" className="text-left" />
          </div>
          {isCompany && (
            <div className="space-y-4 rounded-md border bg-muted p-3">
              <p className="text-sm font-medium">بيانات ممثل الشركة</p>
              <div>
                <Label>اسم ممثل الشركة *</Label>
                <Input value={form.company_rep_name} onChange={e => setForm(f => ({ ...f, company_rep_name: e.target.value }))} />
              </div>
              <div>
                <Label>رقم هاتف الممثل *</Label>
                <Input value={form.company_rep_phone} onChange={e => setForm(f => ({ ...f, company_rep_phone: e.target.value }))} dir="ltr" className="text-left" />
              </div>
            </div>
          )}
          <div>
            <Label>الملاحظات</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
          {/* الحالة — نشط / غير نشط */}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label htmlFor="client-status" className="cursor-pointer">الحالة</Label>
            <div className="flex items-center gap-2">
              <Switch
                id="client-status"
                checked={form.status === 'نشط'}
                onCheckedChange={v => setForm(f => ({ ...f, status: v ? 'نشط' : 'غير نشط' }))}
              />
              <span className="text-sm text-muted-foreground">{form.status}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={!canSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClientFormDialog;
