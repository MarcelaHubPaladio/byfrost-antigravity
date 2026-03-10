/**
 * Utility functions for formatting values
 */

/**
 * Formats a number as BRL currency
 */
export function formatCurrency(value: number | string): string {
    const amount = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(amount)) return "R$ 0,00";

    return amount.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}

/**
 * Formats a date string or object to pt-BR locale
 */
export function formatDate(date: string | Date | undefined | null): string {
    if (!date) return "—";

    try {
        const d = typeof date === "string" ? new Date(date) : date;
        return d.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "Data Inválida";
    }
}
