import React, { useEffect, useState } from 'react';
import { Loader2, History, FilePlus2, FileX2, FilePen, Banknote, Tag, Home, Paperclip, CircleDot, LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils';
import { Property } from '@/types';
import { PropertyLog, propertyLogsService } from '@/services/propertyLogs';

interface PropertyLogDialogProps {
  /** The property whose log is shown; null keeps the dialog closed. */
  property: Property | null;
  onClose: () => void;
}

/** Icon + colour per action family, read off the action key's suffix / prefix. */
function actionStyle(action: string): { icon: LucideIcon; className: string } {
  if (action === 'collection_paid') return { icon: Banknote, className: 'bg-green-100 text-green-700' };
  if (action.startsWith('soum_')) return { icon: Tag, className: 'bg-primary/10 text-primary' };
  if (action.startsWith('attachment_')) return { icon: Paperclip, className: 'bg-muted text-muted-foreground' };
  if (action.startsWith('collection_')) {
    return { icon: Banknote, className: action.endsWith('_deleted') ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700' };
  }
  if (action.endsWith('_created')) return { icon: action.startsWith('property') ? Home : FilePlus2, className: 'bg-green-100 text-green-700' };
  if (action.endsWith('_deleted')) return { icon: FileX2, className: 'bg-red-100 text-red-700' };
  if (action.endsWith('_updated')) return { icon: FilePen, className: 'bg-blue-100 text-blue-700' };
  return { icon: CircleDot, className: 'bg-muted text-muted-foreground' };
}

const PropertyLogDialog: React.FC<PropertyLogDialogProps> = ({ property, onClose }) => {
  const [logs, setLogs] = useState<PropertyLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!property) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setLogs([]);
    propertyLogsService.list(property.id)
      .then(data => { if (!cancelled) setLogs(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [property]);

  return (
    <Dialog open={!!property} onOpenChange={open => !open && onClose()}>
      {/* Close ✕ moved to the left for RTL, as in PropertySoumsDialog. */}
      <DialogContent
        dir="rtl"
        className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto [&>button]:right-auto [&>button]:left-4"
      >
        <DialogHeader className="text-right sm:text-right border-b pb-4">
          <DialogTitle>سجل العقار</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-0.5">
              <div>كود العقار: {property?.property_code || '—'}</div>
              <div>اسم العقار: {property?.name || '—'}</div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="animate-spin mx-auto" size={28} />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-destructive">تعذّر تحميل السجل</div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <History size={48} className="mx-auto mb-3 opacity-40" />
            لا توجد أحداث مسجلة
          </div>
        ) : (
          <ol className="relative space-y-4 border-s ms-4 ps-6 py-2">
            {logs.map(log => {
              const { icon: Icon, className } = actionStyle(log.action);
              return (
                <li key={log.id} className="relative">
                  <span className={`absolute -start-[37px] top-0 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background ${className}`}>
                    <Icon size={14} />
                  </span>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="font-medium">
                      {log.description}
                      {log.unit_number && !log.action.startsWith('unit_') && (
                        <span className="text-muted-foreground font-normal"> — الوحدة {log.unit_number}</span>
                      )}
                    </p>
                    <time dir="ltr" className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    بواسطة: {log.user_name || 'النظام'}
                  </p>
                  {log.changes && (
                    <ul className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 text-sm">
                      {Object.entries(log.changes).map(([label, [from, to]]) => (
                        <li key={label} className="flex flex-wrap gap-x-1.5">
                          <span className="text-muted-foreground">{label}:</span>
                          <span className="line-through text-muted-foreground max-w-[16rem] truncate" title={from ?? ''}>{from ?? 'فارغ'}</span>
                          <span className="text-muted-foreground">←</span>
                          <span className="font-medium max-w-[16rem] truncate" title={to ?? ''}>{to ?? 'فارغ'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PropertyLogDialog;
