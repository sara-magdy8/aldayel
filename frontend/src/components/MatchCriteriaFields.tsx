import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { MatchOptions } from '@/lib/query';

/** Starting value for the أقرب مساحة / أقرب سعر tolerance sliders, in percent. */
export const DEFAULT_MATCH_MARGIN = 10;

/** The criteria a freshly opened matching dialog starts with: exact on both fields. */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  nearest_area:  false,
  area_margin:   DEFAULT_MATCH_MARGIN,
  nearest_price: false,
  price_margin:  DEFAULT_MATCH_MARGIN,
};

interface MatchCriteriaFieldsProps {
  value: MatchOptions;
  onChange: (next: MatchOptions) => void;
  /** Prefix for the checkbox ids, so two panels on one screen keep distinct labels. */
  idPrefix?: string;
}

/**
 * معايير مطابقة اضافية — the shared panel above both matching dialogs
 * (العقارات المطابقة on the requests page, الطلبات المطابقة on the property pages).
 *
 * Size and price are matched exactly until the matching box is ticked, which
 * reveals a 0–100% slider and widens that field to a ± band. The two criteria
 * are independent, and a margin of 0 is equivalent to an exact match.
 */
const MatchCriteriaFields: React.FC<MatchCriteriaFieldsProps> = ({ value, onChange, idPrefix = 'match' }) => {
  const patch = (p: Partial<MatchOptions>) => onChange({ ...value, ...p });

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <p className="text-sm font-semibold">معايير مطابقة اضافية</p>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-nearest-area`}
            checked={!!value.nearest_area}
            onCheckedChange={c => patch({ nearest_area: !!c })}
          />
          <Label htmlFor={`${idPrefix}-nearest-area`} className="cursor-pointer font-normal">أقرب مساحة</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-nearest-price`}
            checked={!!value.nearest_price}
            onCheckedChange={c => patch({ nearest_price: !!c })}
          />
          <Label htmlFor={`${idPrefix}-nearest-price`} className="cursor-pointer font-normal">أقرب سعر</Label>
        </div>
      </div>

      {value.nearest_area && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <Label className="font-normal">هامش فرق المساحة المسموح</Label>
            <span className="text-sm text-muted-foreground tabular-nums" dir="ltr">{value.area_margin ?? 0}%</span>
          </div>
          <Slider
            value={[value.area_margin ?? 0]}
            onValueChange={([v]) => patch({ area_margin: v })}
            min={0}
            max={100}
            step={1}
            aria-label="هامش فرق المساحة المسموح"
          />
        </div>
      )}

      {value.nearest_price && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <Label className="font-normal">هامش فرق السعر المسموح</Label>
            <span className="text-sm text-muted-foreground tabular-nums" dir="ltr">{value.price_margin ?? 0}%</span>
          </div>
          <Slider
            value={[value.price_margin ?? 0]}
            onValueChange={([v]) => patch({ price_margin: v })}
            min={0}
            max={100}
            step={1}
            aria-label="هامش فرق السعر المسموح"
          />
        </div>
      )}
    </div>
  );
};

export default MatchCriteriaFields;
