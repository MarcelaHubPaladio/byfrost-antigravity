import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type AsyncMultiSelectProps = {
    values?: string[];
    initialLabels?: Record<string, string>;
    onChange: (values: string[]) => void;
    loadOptions: (inputValue: string) => Promise<Option[]>;
    placeholder?: string;
    defaultOptions?: boolean;
    className?: string;
};

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

export function AsyncMultiSelect({
    values = [],
    initialLabels = {},
    onChange,
    loadOptions,
    placeholder = "Select...",
    defaultOptions = false,
    className,
}: AsyncMultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");
    const debouncedSearchTerm = useDebounceValue(searchTerm, 300);
    const [options, setOptions] = React.useState<Option[]>([]);
    const [loading, setLoading] = React.useState(false);
    
    // Maintain a map of selected labels so we don't lose them when options change
    const [selectedLabels, setSelectedLabels] = React.useState<Record<string, string>>(initialLabels);

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
                    // Update our labels map with newly fetched options
                    const newLabels = { ...selectedLabels };
                    let changed = false;
                    opts.forEach(opt => {
                        if (values.includes(opt.value) && newLabels[opt.value] !== opt.label) {
                            newLabels[opt.value] = opt.label;
                            changed = true;
                        }
                    });
                    if (changed) setSelectedLabels(newLabels);
                }
            })
            .catch((err) => {
                console.error("AsyncMultiSelect load options error", err);
                if (active) setOptions([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [debouncedSearchTerm, loadOptions, defaultOptions, values]);

    const handleSelect = (optionValue: string, optionLabel: string) => {
        const isSelected = values.includes(optionValue);
        let newValues: string[];
        if (isSelected) {
            newValues = values.filter((v) => v !== optionValue);
        } else {
            newValues = [...values, optionValue];
            setSelectedLabels(prev => ({ ...prev, [optionValue]: optionLabel }));
        }
        onChange(newValues);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "h-9 w-full justify-between rounded-xl border-slate-200 bg-white/50 px-3 py-2 text-sm font-normal shadow-sm hover:bg-white/80 dark:border-slate-800 dark:bg-slate-950/20 dark:hover:bg-slate-900/50",
                        className
                    )}
                >
                    <span className="truncate">
                        {values.length === 0 && placeholder}
                        {values.length === 1 && (selectedLabels[values[0]] || values[0])}
                        {values.length > 1 && `${values.length} selecionados`}
                    </span>
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
                        {!loading && options.map((option) => {
                            const isSelected = values.includes(option.value);
                            return (
                                <CommandItem
                                    key={option.value}
                                    value={option.value}
                                    onSelect={() => handleSelect(option.value, option.label)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            isSelected ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            );
                        })}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
