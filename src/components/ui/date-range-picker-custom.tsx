import * as React from "react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerCustomProps {
  date: DateRange | undefined;
  onDateChange: (date: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePickerCustom({
  date,
  onDateChange,
  className,
}: DateRangePickerCustomProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const ranges = [
    {
      label: "Hoje",
      getValue: () => ({ from: new Date(), to: new Date() }),
    },
    {
      label: "Ontem",
      getValue: () => {
        const yesterday = subDays(new Date(), 1);
        return { from: yesterday, to: yesterday };
      },
    },
    {
      label: "Últimos 7 dias",
      getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
    },
    {
      label: "Últimos 30 dias",
      getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
    },
    {
      label: "Mês Atual",
      getValue: () => ({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
      }),
    },
    {
      label: "Mês Passado",
      getValue: () => ({
        from: startOfMonth(subMonths(new Date(), 1)),
        to: endOfMonth(subMonths(new Date(), 1)),
      }),
    },
    {
      label: "Todo Período",
      getValue: () => undefined,
    },
  ];

  return (
    <div className={cn("grid gap-2 relative", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full sm:w-[260px] justify-start text-left font-normal rounded-xl h-10",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                  {format(date.to, "dd/MM/yyyy", { locale: ptBR })}
                </>
              ) : (
                format(date.from, "dd/MM/yyyy", { locale: ptBR })
              )
            ) : (
              <span>Filtrar por data</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x">
            <div className="flex flex-col gap-1 p-3 w-[180px]">
              {ranges.map((range) => {
                const rangeValue = range.getValue();
                const isActive =
                  (rangeValue === undefined && date === undefined) ||
                  (rangeValue?.from &&
                    date?.from &&
                    format(rangeValue.from, "yyyy-MM-dd") ===
                      format(date.from, "yyyy-MM-dd") &&
                    ((!rangeValue.to && !date?.to) ||
                      (rangeValue.to &&
                        date?.to &&
                        format(rangeValue.to, "yyyy-MM-dd") ===
                          format(date.to, "yyyy-MM-dd"))));

                return (
                  <Button
                    key={range.label}
                    variant="ghost"
                    className={cn(
                      "justify-start text-sm font-medium h-9 px-3 rounded-lg",
                      isActive
                        ? "bg-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))] font-bold"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                    onClick={() => {
                      onDateChange(range.getValue());
                      setIsOpen(false);
                    }}
                  >
                    {range.label}
                  </Button>
                );
              })}
            </div>
            <div className="p-3">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={onDateChange}
                numberOfMonths={2}
                locale={ptBR}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {date && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-10 w-10 text-slate-400 hover:text-slate-600 rounded-r-xl"
          onClick={(e) => {
            e.stopPropagation();
            onDateChange(undefined);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
