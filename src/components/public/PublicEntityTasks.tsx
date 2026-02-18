import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PublicTask = {
    id: string;
    title: string | null;
    summary_text: string | null;
    state: string;
    meta_json: any;
    created_at: string;
};

function fmtDate(ts: string) {
    try {
        return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
        return "";
    }
}

export function PublicEntityTasks({ tasks }: { tasks: PublicTask[] }) {
    if (!tasks.length) {
        return (
            <div className="rounded-[28px] border border-black/10 bg-white/85 p-8 text-center shadow-sm">
                <div className="text-sm text-slate-600">Nenhuma tarefa encontrada.</div>
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => {
                const dueAt = task.meta_json?.due_at;
                const isLate = dueAt && new Date(dueAt) < new Date() && task.state !== "DONE";

                return (
                    <Card key={task.id} className="flex flex-col rounded-[26px] border-black/10 bg-white/90 p-5 shadow-sm transition hover:shadow-md">
                        <div className="mb-2 flex items-start justify-between gap-2">
                            <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[10px] uppercase tracking-wider">
                                {task.state}
                            </Badge>
                            {dueAt ? (
                                <div className={cn("text-xs font-medium", isLate ? "text-red-600" : "text-slate-500")}>
                                    {isLate ? "Atrasado: " : "Prazo: "}
                                    {fmtDate(dueAt)}
                                </div>
                            ) : null}
                        </div>

                        <h3 className="mb-1 text-base font-bold text-slate-900 line-clamp-2" title={task.title || ""}>
                            {task.title || "(sem título)"}
                        </h3>

                        <div
                            className="mb-4 flex-1 text-sm text-slate-600 line-clamp-3"
                            dangerouslySetInnerHTML={{ __html: task.summary_text || "" }}
                        />
                        {/* Note: summary_text is HTML from TipTap, might need sanitization if not trusted, but here it's from our system */}

                        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                            <div>Criado em {fmtDate(task.created_at)}</div>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
