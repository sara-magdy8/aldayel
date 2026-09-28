import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Bell, CalendarClock, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { settingsService } from '@/services/settings';
import type { ApiError } from '@/services/api';

/** Matches MAX_EXPIRY_ALERTS in SettingController — keep the two in step. */
const MAX_ALERTS = 10;

/** Longest offset the backend accepts for a single reminder. */
const MAX_DAYS = 365;

/**
 * Grow or shrink `days` to `count` entries, keeping the values already typed.
 * New slots start empty so the office fills them in deliberately.
 */
const resizeDays = (days: string[], count: number): string[] =>
  Array.from({ length: count }, (_, i) => days[i] ?? '');

const NotificationSettingsPage = () => {
  const { toast } = useToast();

  // Both kept as strings so the inputs can be cleared while editing.
  const [alertCount, setAlertCount] = useState('0');
  const [alertDays, setAlertDays] = useState<string[]>([]);
  const [endedEnabled, setEndedEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const settings = await settingsService.loadNotifications();
        setAlertCount(String(settings.rental_expiry_alert_count));
        setAlertDays(settings.rental_expiry_alert_days.map(String));
        setEndedEnabled(settings.rental_ended_alert_enabled);
      } catch {
        toast({ title: 'خطأ', description: 'تعذّر تحميل إعدادات التنبيهات', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Changing the count renders that many day inputs, capped at MAX_ALERTS. */
  const handleCountChange = (value: string) => {
    if (value === '') {
      setAlertCount('');
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return;

    const count = Math.min(parsed, MAX_ALERTS);
    setAlertCount(String(count));
    setAlertDays(prev => resizeDays(prev, count));
  };

  const handleDayChange = (index: number, value: string) =>
    setAlertDays(prev => prev.map((d, i) => (i === index ? value : d)));

  const handleSave = async () => {
    const count = Number(alertCount || 0);

    if (alertDays.some(d => d.trim() === '')) {
      toast({ title: 'بيانات ناقصة', description: 'أدخل عدد الأيام لكل تنبيه', variant: 'destructive' });
      return;
    }

    const days = alertDays.map(Number);

    if (days.some(d => !Number.isInteger(d) || d < 1 || d > MAX_DAYS)) {
      toast({
        title: 'قيمة غير صحيحة',
        description: `عدد الأيام يجب أن يكون رقماً صحيحاً بين 1 و ${MAX_DAYS}`,
        variant: 'destructive',
      });
      return;
    }

    if (new Set(days).size !== days.length) {
      toast({ title: 'تكرار', description: 'لا يمكن تكرار نفس عدد الأيام في أكثر من تنبيه', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const saved = await settingsService.saveNotifications({
        rental_expiry_alert_count: count,
        rental_expiry_alert_days: days,
        rental_ended_alert_enabled: endedEnabled,
      });
      // The backend sorts the offsets descending, so mirror what it stored.
      setAlertCount(String(saved.rental_expiry_alert_count));
      setAlertDays(saved.rental_expiry_alert_days.map(String));
      setEndedEnabled(saved.rental_ended_alert_enabled);
      toast({ title: 'تم الحفظ', description: 'تم حفظ إعدادات التنبيهات بنجاح' });
    } catch (err) {
      const msg = (err as ApiError).message ?? 'تعذّر حفظ إعدادات التنبيهات';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">إعدادات التنبيهات</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            تنبيهات انتهاء عقود الإيجار
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label>عدد مرات التنبيه قبل انتهاء عقد الإيجار</Label>
            <Input
              type="number"
              min={0}
              max={MAX_ALERTS}
              value={alertCount}
              onChange={e => handleCountChange(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              أدخل عدد التنبيهات المطلوبة (بحد أقصى {MAX_ALERTS})، ثم حدّد لكل تنبيه عدد الأيام قبل انتهاء العقد.
            </p>
          </div>

          {alertDays.length > 0 && (
            <>
              <Separator />
              <div className="grid grid-cols-1  gap-4">
                {alertDays.map((day, index) => (
                  <div key={index} className="space-y-2">
                    <Label>التنبيه رقم {index + 1}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground shrink-0">
                        يجب التنبيه قبل انتهاء العقد بمدة
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={MAX_DAYS}
                        value={day}
                        onChange={e => handleDayChange(index, e.target.value)}
                        className="w-24"
                        placeholder="30"
                      />
                      <span className="text-sm text-muted-foreground shrink-0">يوم</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Separator />
          {/* Switch first in the DOM so it sits at the start of the row — the
              right-hand side under RTL — beside its label rather than pushed to
              the far edge of the card. */}
          <div className="flex items-start gap-3">
            <Switch
              id="ended-alert"
              checked={endedEnabled}
              onCheckedChange={setEndedEnabled}
              className="shrink-0 mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="ended-alert" className="cursor-pointer">التنبيه عند انتهاء العقد</Label>
              <p className="text-xs text-muted-foreground">
                إرسال إشعار للمستأجر بعد انتهاء مدة العقد، بالإضافة إلى التنبيهات السابقة قبل الانتهاء.
              </p>
            </div>
          </div>

          <Separator />
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving
              ? <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              : <Save className="h-4 w-4 ml-2" />}
            حفظ التغييرات
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationSettingsPage;
