import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Page-size choices offered in the "عدد السجلات" dropdown. */
export const PER_PAGE_OPTIONS = [10, 20, 50, 100];

/** Backend default page size — pages should seed their state with this. */
export const DEFAULT_PER_PAGE = 20;

/** How many numbered pages the sliding window shows around the current page. */
const WINDOW = 5;

type PageItem = number | 'gap-start' | 'gap-end';

/**
 * Numbered pages with ellipsis: a window of `WINDOW` pages around the current
 * one, always bookended by the first and last page. On page 1 that reads
 * 1 2 3 4 5 … 50, which is the datatable behaviour users expect.
 */
const buildPageItems = (currentPage: number, lastPage: number): PageItem[] => {
  // Short ranges fit whole — an ellipsis hiding a single page helps nobody.
  if (lastPage <= WINDOW + 2) {
    return Array.from({ length: lastPage }, (_, i) => i + 1);
  }

  let start = Math.max(1, currentPage - Math.floor(WINDOW / 2));
  let end = start + WINDOW - 1;
  if (end > lastPage) {
    end = lastPage;
    start = end - WINDOW + 1;
  }

  const items: PageItem[] = [];
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push('gap-start');
  }
  for (let p = start; p <= end; p++) items.push(p);
  if (end < lastPage) {
    if (end < lastPage - 1) items.push('gap-end');
    items.push(lastPage);
  }
  return items;
};

interface DataTablePaginationProps {
  currentPage: number;
  lastPage: number;
  /** Total matching rows across every page, from the paginated response. */
  total: number;
  perPage: number;
  /** Disables every control while a fetch is in flight. */
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

/**
 * Datatable-style pagination: page-size dropdown, numbered pages with ellipsis,
 * and an "إظهار ١ إلى ٢٠ من أصل ١٠٠٠" range summary. Shared by the list pages so
 * the wording and layout stay identical everywhere.
 */
const DataTablePagination = ({
  currentPage,
  lastPage,
  total,
  perPage,
  loading = false,
  onPageChange,
  onPerPageChange,
}: DataTablePaginationProps) => {
  if (total === 0) return null;

  const from = (currentPage - 1) * perPage + 1;
  const to = Math.min(currentPage * perPage, total);
  const items = buildPageItems(currentPage, lastPage);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {/* عدد السجلات في الصفحة */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>عرض</span>
        <Select
          value={String(perPage)}
          onValueChange={v => onPerPageChange(Number(v))}
          disabled={loading}
        >
          <SelectTrigger className="h-9 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PER_PAGE_OPTIONS.map(n => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>سجل</span>
      </div>

      {/* أرقام الصفحات */}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={currentPage === 1 || loading}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronRight size={16} />
            السابق
          </Button>

          {items.map(item =>
            typeof item === 'number' ? (
              <Button
                key={item}
                variant={item === currentPage ? 'default' : 'outline'}
                size="sm"
                className="min-w-9 px-2"
                disabled={loading}
                aria-current={item === currentPage ? 'page' : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            ) : (
              <span key={item} className="px-1 text-muted-foreground" aria-hidden>…</span>
            ),
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={currentPage === lastPage || loading}
            onClick={() => onPageChange(currentPage + 1)}
          >
            التالي
            <ChevronLeft size={16} />
          </Button>
        </div>
      )}

      {/* ملخص النطاق */}
      <div className="text-sm text-muted-foreground">
        إظهار {from} إلى {to} من أصل {total}
      </div>
    </div>
  );
};

export default DataTablePagination;
