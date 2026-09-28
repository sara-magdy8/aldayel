import * as React from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface AsyncSearchableSelectProps<T> {
  value: string;
  /** Receives the whole picked option — callers usually need more than its id. */
  onSelect: (option: T) => void;
  /** Queries the backend. Runs once when the popover opens, then debounced per keystroke. */
  fetchOptions: (search: string) => Promise<T[]>;
  optionValue: (option: T) => string;
  optionLabel: (option: T) => string;
  /**
   * Trigger text for the current value while it is not among the fetched
   * options — which is the normal case on open, since the list is capped and
   * the selection may not be in the first page of results.
   */
  selectedLabel?: string;
  /**
   * Supply for an optional field: a "clear" entry appears above the results
   * once something is picked. Omit on required fields, where there is no valid
   * way back to no-selection.
   */
  onClear?: () => void;
  clearLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * The backend-searched counterpart to {@link SearchableSelect}: instead of
 * filtering a fully-loaded array client-side, it asks the server on each
 * keystroke and renders whatever comes back. Use it wherever the source table
 * can outgrow a dropdown — cmdk's own filtering is off, so the server's ranking
 * and cap are what the user sees.
 */
export function AsyncSearchableSelect<T>({
  value,
  onSelect,
  fetchOptions,
  optionValue,
  optionLabel,
  selectedLabel,
  onClear,
  clearLabel = "بدون تحديد",
  placeholder = "اختر...",
  searchPlaceholder = "بحث...",
  emptyText = "لا توجد نتائج",
  loadingText = "جاري البحث...",
  className,
  disabled,
}: AsyncSearchableSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [options, setOptions] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Held in a ref so callers can pass an inline closure without the fetch
  // effect re-firing on every parent render.
  const fetchRef = React.useRef(fetchOptions);
  React.useEffect(() => {
    fetchRef.current = fetchOptions;
  });

  React.useEffect(() => {
    if (!open) {
      // Start the next open from a clean query rather than the stale one.
      setSearch("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    // The open-with-no-query fetch is immediate; only typing is debounced.
    const t = setTimeout(async () => {
      try {
        const res = await fetchRef.current(search);
        if (!cancelled) setOptions(res);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, search]);

  const picked = options.find((o) => optionValue(o) === value);
  const triggerLabel = picked ? optionLabel(picked) : selectedLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("line-clamp-1 text-start", !triggerLabel && "text-muted-foreground")}>
            {triggerLabel || placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* shouldFilter={false}: the server already decided what matches. */}
        <Command dir="rtl" shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="me-2 h-4 w-4 animate-spin" /> {loadingText}
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                {onClear && value && (
                  <CommandGroup>
                    <CommandItem
                      value="__clear_selection__"
                      onSelect={() => {
                        onClear();
                        setOpen(false);
                      }}
                      className="justify-center text-muted-foreground"
                    >
                      {clearLabel}
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {options.map((o) => {
                    const v = optionValue(o);
                    return (
                      <CommandItem
                        key={v}
                        value={v}
                        onSelect={() => {
                          onSelect(o);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn("ms-auto h-4 w-4", value === v ? "opacity-100" : "opacity-0")}
                        />
                        {optionLabel(o)}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
