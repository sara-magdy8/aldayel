import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { authService, AuthUser } from '@/services/auth';
import { ApiError } from '@/services/api';

/** Password input with an inline show/hide toggle. */
const PasswordInput: React.FC<React.ComponentProps<typeof Input>> = (props) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} dir="ltr" className="text-left pl-10" />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser | null;
  /** Called with the updated user so the parent can refresh the header. */
  onSaved: (user: AuthUser) => void;
}

const emptyForm = {
  name: '',
  email: '',
  current_password: '',
  password: '',
  password_confirmation: '',
};

const ProfileDialog: React.FC<ProfileDialogProps> = ({ open, onOpenChange, user, onSaved }) => {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Reset the form to the current user each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, name: user?.name ?? '', email: user?.email ?? '' });
      setErrors({});
    }
  }, [open, user]);

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const wantsPasswordChange = !!(form.password || form.current_password || form.password_confirmation);

  const canSave =
    form.name.trim() &&
    form.email.trim() &&
    !saving &&
    (!wantsPasswordChange ||
      (form.current_password && form.password.length >= 8 && form.password === form.password_confirmation));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setErrors({});
    try {
      const updated = await authService.updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        ...(wantsPasswordChange
          ? {
              current_password: form.current_password,
              password: form.password,
              password_confirmation: form.password_confirmation,
            }
          : {}),
      });
      onSaved(updated);
      toast.success('تم تحديث الملف الشخصي بنجاح');
      onOpenChange(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) {
        // Flatten Laravel's { field: [messages] } into { field: firstMessage }.
        setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      }
      toast.error(err.message || 'تعذّر حفظ التغييرات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>الملف الشخصي</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>الاسم *</Label>
            <Input value={form.name} onChange={set('name')} />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label>البريد الإلكتروني *</Label>
            <Input type="email" value={form.email} onChange={set('email')} dir="ltr" className="text-left" />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>

          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              تغيير كلمة المرور (اتركها فارغة للإبقاء عليها)
            </p>

            <div className="space-y-4">
              <div>
                <Label>كلمة المرور الحالية</Label>
                <PasswordInput
                  value={form.current_password}
                  onChange={set('current_password')}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                {errors.current_password && (
                  <p className="text-xs text-destructive mt-1">{errors.current_password}</p>
                )}
              </div>

              <div>
                <Label>كلمة المرور الجديدة</Label>
                <PasswordInput
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                {form.password.length > 0 && form.password.length < 8 && (
                  <p className="text-xs text-destructive mt-1">كلمة المرور يجب ألا تقل عن 8 أحرف</p>
                )}
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
              </div>

              <div>
                <Label>تأكيد كلمة المرور الجديدة</Label>
                <PasswordInput
                  value={form.password_confirmation}
                  onChange={set('password_confirmation')}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                {form.password_confirmation.length > 0 && form.password !== form.password_confirmation && (
                  <p className="text-xs text-destructive mt-1">كلمتا المرور غير متطابقتين</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileDialog;
