
export type PresencePunchType = "ENTRY" | "BREAK_START" | "BREAK_END" | "BREAK2_START" | "BREAK2_END" | "EXIT";
export type PresencePunchSource = "APP" | "WHATSAPP";

export function getLocalYmd(timeZone: string, d = new Date()) {
    const dtf = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return dtf.format(d); // YYYY-MM-DD
}

export function inferNextPunchType(last: PresencePunchType | null, breakRequired: boolean): PresencePunchType | null {
    if (!last) return "ENTRY";
    if (last === "ENTRY") return breakRequired ? "BREAK_START" : "EXIT";
    if (last === "BREAK_START") return "BREAK_END";
    if (last === "BREAK_END") return "EXIT";
    return null;
}
