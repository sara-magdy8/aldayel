import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface ResetFiltersButtonProps {
  /** Only render when at least one filter is active. */
  show: boolean;
  onReset: () => void;
  /**
   * Filter rows whose controls sit under a <Label> need an invisible label of
   * the same height so the button lines up with them. Rows that align with
   * `items-end` and have no labels should pass false.
   */
  spacer?: boolean;
  className?: string;
}

/**
 * "إعادة تعيين" — clears every filter on a list/report page. Shared by all
 * filter rows so the wording, icon and placement stay identical everywhere.
 */
const ResetFiltersButton = ({ show, onReset, spacer = true, className }: ResetFiltersButtonProps) => {
  if (!show) return null;

  const button = (
    <Button variant="outline" onClick={onReset} className={className ?? 'gap-2 w-full md:w-auto'}>
      <RotateCcw size={16} />
      إعادة تعيين
    </Button>
  );

  if (!spacer) return button;

  return (
    <div className="space-y-1.5 mt-2">
      <Label className="invisible hidden md:block">&nbsp;</Label>
      {button}
    </div>
  );
};

export default ResetFiltersButton;
