import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff } from 'lucide-react';
import { AppUser, Role, UserFormData, UserRole } from '@/services/users';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AppUser | null;
  /** الصلاحيات from the roles table, loaded once by the page. */
  roles: Role[];
  onSave: (data: UserFormData) => void;
}

const UserFormDialog: React.FC<UserFormDialogProps> = ({ open, onOpenChange, user, roles, onSave }) => {
  const isEdit = !!user;
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'staff' as UserRole, is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name, email: user.email, password: '', role: user.role, is_active: user.is_active });
    } else {
      setForm({ name: '', email: '', password: '', role: 'staff', is_active: true });
    }
    setShowPassword(false);
  }, [user, open]);

  // Password is required on create; on edit a blank field means "keep current".
  const canSave = form.name.trim() && form.email.trim() && (isEdit || form.password.length >= 8);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      is_active: form.is_active,
      ...(form.password ? { password: form.password } : {}),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>الاسم *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>البريد الإلكتروني *</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} dir="ltr" className="text-left" />
          </div>
          <div>
            <Label>{isEdit ? 'كلمة المرور (اتركها فارغة للإبقاء عليها)' : 'كلمة المرور *'}</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                dir="ltr"
                className="text-left pl-10"
                placeholder={isEdit ? '••••••••' : ''}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!isEdit && form.password.length > 0 && form.password.length < 8 && (
              <p className="text-xs text-destructive mt-1">كلمة المرور يجب ألا تقل عن 8 أحرف</p>
            )}
          </div>
          <div>
            <Label>الصلاحية *</Label>
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
              <SelectTrigger><SelectValue placeholder="اختر الصلاحية" /></SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  // The slug is submitted; the Arabic name is only what is shown.
                  <SelectItem key={r.id} value={r.slug}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="user-active" className="cursor-pointer">الحساب نشط</Label>
            <Switch id="user-active" checked={form.is_active} onCheckedChange={c => setForm(f => ({ ...f, is_active: c }))} />
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

export default UserFormDialog;
