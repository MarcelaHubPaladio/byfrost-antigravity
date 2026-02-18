import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export type Option = {
    value: string;
    label: string;
};

type AsyncSelectProps = {
    value?: string | null;
    onChange: (value: string | null) => void;
    loadOptions: (inputValue: string) => Promise<Option[]>;
    placeholder?: string;
    defaultOptions?: boolean;
    className?: string;
};

// Simple hook if useDebounce is not available globally, but usually it is.
// If not, I'll assume I can just use a timeout.
// Let's assume useDebounce exists for now, if not I'll get an error and fix it.
// Checking imports... I didn't check hooks folder. I'll implement a local debounce to be safe.

function useDebounceValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

    React.useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}


export function AsyncSelect({
    value,
    onChange,
    loadOptions,
    placeholder = "Select...",
    defaultOptions = false,
    className,
}: AsyncSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");
    const debouncedSearchTerm = useDebounceValue(searchTerm, 300);
    const [options, setOptions] = React.useState<Option[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedLabel, setSelectedLabel] = React.useState<string>("");

    // Load initial options or when search changes
    React.useEffect(() => {
        let active = true;

        if (!defaultOptions && !debouncedSearchTerm) {
            setOptions([]);
            return;
        }

        setLoading(true);
        loadOptions(debouncedSearchTerm)
            .then((opts) => {
                if (active) {
                    setOptions(opts);
                }
            })
            .catch((err) => {
                console.error("AsyncSelect load options error", err);
                if (active) setOptions([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [debouncedSearchTerm, loadOptions, defaultOptions]);

    // Sync selected label when value changes (if possible)
    // This is tricky because we might not have the option in the list.
    // For now, if the value is in options, we update label.
    // If not, we might display value or rely on parent to pass label (refactor needed for that).
    // But TrelloEntityCard fetches display_name separately for display when not editing.
    // When editing, we rely on the list.
    React.useEffect(() => {
        const found = options.find((o) => o.value === value);
        if (found) setSelectedLabel(found.label);
        else if (!value) setSelectedLabel("");
        // If value exists but not in options, we keep previous label or empty.
        // Ideally we should have a way to fetch label for initial value.
    }, [value, options]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between", className)}
                >
                    {selectedLabel || value || placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={placeholder}
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                    />
                    <CommandList>
                        {loading && (
                            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Carregando...
                            </div>
                        )}
                        {!loading && options.length === 0 && (
                            <CommandEmpty>Nenhum resultado.</CommandEmpty>
                        )}
                        {!loading && options.map((option) => (
                            <CommandItem
                                key={option.value}
                                value={option.value}
                                onSelect={(currentValue) => {
                                    onChange(currentValue === value ? null : currentValue);
                                    setSelectedLabel(option.label);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        value === option.value ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                {option.label}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
