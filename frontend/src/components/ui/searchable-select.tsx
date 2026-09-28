import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

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

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  /** Options as plain strings (value === label) or {value,label} objects. */
  options: (string | SearchableSelectOption)[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Placeholder shown inside the search box. */
  searchPlaceholder?: string;
  /** Text shown when no option matches the search. */
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

const normalize = (o: string | SearchableSelectOption): SearchableSelectOption =>
  typeof o === "string" ? { value: o, label: o } : o;

/**
 * A drop-in replacement for <Select> that lets the user type to filter the
 * options. Built from Popover + cmdk (Command) so filtering happens client-side
 * over the option labels. RTL-aware to match the Arabic admin UI.
 */
export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "اختر...",
  searchPlaceholder = "بحث...",
  emptyText = "لا توجد نتائج",
  className,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const items = React.useMemo(() => options.map(normalize), [options]);
  const selected = items.find((o) => o.value === value);

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
          <span className={cn("line-clamp-1 text-start", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          dir="rtl"
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onValueChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "ms-auto h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface MultiSearchableSelectProps {
  options: (string | SearchableSelectOption)[];
  /** Currently selected values. An empty array means "no filter" (all). */
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Shown on the trigger when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Multi-select variant of {@link SearchableSelect}. The popover stays open while
 * toggling options; an empty selection means "all" (no filter). The trigger shows
 * the single label when one item is picked, otherwise a "N محدد" count.
 */
export function MultiSearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "الكل",
  searchPlaceholder = "بحث...",
  emptyText = "لا توجد نتائج",
  className,
  disabled,
}: MultiSearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const items = React.useMemo(() => options.map(normalize), [options]);
  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const selectedItems = items.filter((o) => selectedSet.has(o.value));

  const toggle = (v: string) =>
    onValueChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  const label =
    selectedItems.length === 0
      ? placeholder
      : selectedItems.length === 1
        ? selectedItems[0].label
        : `${selectedItems.length} محدد`;

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
          <span className={cn("line-clamp-1 text-start", selectedItems.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          dir="rtl"
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {value.length > 0 && (
              <CommandGroup>
                <CommandItem
                  value="__clear_selection__"
                  onSelect={() => onValueChange([])}
                  className="justify-center text-muted-foreground"
                >
                  مسح التحديد
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {items.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <span
                      className={cn(
                        "me-2 flex h-4 w-4 items-center justify-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
