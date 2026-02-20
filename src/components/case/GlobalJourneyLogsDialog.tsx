import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Terminal, Code2, CheckCircle2, XCircle, Info, Clock, Database, ArrowRightLeft, Loader2, ChevronDown } from "lucide-react";

interface GlobalJourneyLogsDialogProps {
    journeyId: string;
    journeyName: string;
    tenantId: string;
}

type LogType = 'webhook' | 'message';

interface UnifiedLog {
    id: string;
    type: LogType;
    timestamp: string;
    ok?: boolean;
    status?: number;
    reason?: string;
    direction: string;
    wa_type?: string;
    body?: string;
    from?: string;
    to?: string;
    caseId?: string;
    raw: any;
}

const PAGE_SIZE = 15;

export function GlobalJourneyLogsDialog({ journeyId, journeyName, tenantId }: GlobalJourneyLogsDialogProps) {
    const [open, setOpen] = useState(false);
    const [viewingLog, setViewingLog] = useState<UnifiedLog | null>(null);

    const logsQ = useInfiniteQuery({
        queryKey: ["global_journey_logs", tenantId, journeyId],
        enabled: open && Boolean(tenantId && journeyId),
        initialPageParam: 0,
        queryFn: async ({ pageParam = 0 }) => {
            const from = pageParam * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            // Fetch webhooks
            const { data: inboxData, error: inboxError } = await supabase
                .from("wa_webhook_inbox")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("journey_id", journeyId)
                .order("received_at", { ascending: false })
                .range(from, to);

            if (inboxError) throw inboxError;

            // Fetch messages linked to this journey
            const { data: msgData, error: msgError } = await supabase
                .from("wa_messages")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("journey_id", journeyId)
                .order("occurred_at", { ascending: false })
                .range(from, to);

            if (msgError) throw msgError;

            const unified: UnifiedLog[] = [];

            (inboxData || []).forEach(it => {
                unified.push({
                    id: `inbox-${it.id}`,
                    type: 'webhook',
                    timestamp: it.received_at,
                    ok: it.ok,
                    status: it.http_status,
                    reason: it.reason,
                    direction: it.direction,
                    wa_type: it.wa_type,
                    from: it.from_phone,
                    to: it.to_phone,
                    caseId: it.meta_json?.case_id,
                    raw: { payload: it.payload_json, meta: it.meta_json }
                });
            });

            (msgData || []).forEach(m => {
                unified.push({
                    id: `msg-${m.id}`,
                    type: 'message',
                    timestamp: m.occurred_at,
                    ok: true,
                    direction: m.direction,
                    wa_type: m.type,
                    body: m.body_text,
                    from: m.from_phone,
                    to: m.to_phone,
                    caseId: m.case_id,
                    raw: m
                });
            });

            return unified.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        },
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length === PAGE_SIZE * 2 ? allPages.length : undefined; // Rough estimate
        }
    });

    const allLogs = useMemo(() => {
        return logsQ.data?.pages.flat() || [];
    }, [logsQ.data]);

    const fmtTs = (ts: string) => {
        return new Date(ts).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="secondary"
                    className="h-9 rounded-2xl gap-2 hover:bg-slate-200"
                    title={`Ver logs técnicos da jornada ${journeyName}`}
                >
                    <Terminal className="h-4 w-4" />
                    Logs
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-[28px] border-slate-200 p-0 shadow-2xl">
                <DialogHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
                            <Terminal className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-slate-900">
                                Debugger Global: {journeyName}
                            </DialogTitle>
                            <DialogDescription className="text-xs font-medium text-slate-500">
                                Acompanhe o roteamento e processamento de todas as mensagens nesta jornada.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="relative space-y-4 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                        {allLogs.map((log) => {
                            const isWebhook = log.type === 'webhook';
                            const isOk = log.ok;

                            return (
                                <div key={log.id} className="relative pl-10">
                                    <div
                                        className={cn(
                                            "absolute left-1 top-1.5 h-5 w-5 rounded-full border-4 border-white shadow-sm ring-1 ring-slate-200",
                                            isWebhook ? (isOk ? "bg-emerald-500" : "bg-rose-500") : "bg-slate-900"
                                        )}
                                    />

                                    <div className={cn(
                                        "group rounded-2xl border p-4 transition hover:shadow-md",
                                        isWebhook ? "bg-slate-50/50 border-slate-200 hover:bg-white" : "bg-white border-slate-900/10 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)]"
                                    )}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className="text-[11px] font-bold text-slate-400 font-mono">
                                                        {fmtTs(log.timestamp)}
                                                    </span>

                                                    {isWebhook ? (
                                                        <Badge variant="secondary" className={cn(
                                                            "h-5 rounded-lg px-2 text-[9px] font-black uppercase tracking-wider",
                                                            isOk ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                                        )}>
                                                            WEBHOOK {isOk ? "OK" : "ERROR"}
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="h-5 rounded-lg px-2 text-[9px] font-black uppercase tracking-wider bg-slate-900 text-emerald-400">
                                                            DB_COMMIT
                                                        </Badge>
                                                    )}

                                                    <Badge variant="outline" className={cn(
                                                        "h-5 rounded-lg border-slate-200 bg-white px-2 text-[9px] font-bold uppercase",
                                                        log.direction === 'inbound' ? "text-indigo-600" : "text-emerald-600"
                                                    )}>
                                                        {log.direction}
                                                    </Badge>

                                                    {log.caseId && (
                                                        <Badge variant="outline" className="h-5 rounded-lg bg-indigo-50 text-indigo-700 border-indigo-100 text-[10px] font-mono">
                                                            case:{log.caseId.slice(0, 8)}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className="flex-none">
                                                        <div className="flex items-center gap-1.5">
                                                            {isWebhook ? <ArrowRightLeft className="h-3 w-3 text-slate-400" /> : <Database className="h-3 w-3 text-slate-400" />}
                                                            <span className="text-xs font-black text-slate-900 uppercase">
                                                                {log.wa_type || 'event'}
                                                            </span>
                                                        </div>
                                                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                                            {log.direction === 'inbound' ? `from: ${log.from || '?'}` : `to: ${log.to || '?'}`}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 min-w-0 border-l border-slate-100 pl-4">
                                                        {isWebhook ? (
                                                            <div className="text-[11px] text-slate-600 font-medium">
                                                                {log.reason || 'processed'} {log.status && <span className="text-slate-400 ml-1">(HTTP {log.status})</span>}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-slate-800 line-clamp-1 italic bg-slate-50 rounded px-2 py-0.5 border border-slate-100">
                                                                {log.body || `[Mídia: ${log.wa_type}]`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 rounded-xl hover:bg-slate-100 transition"
                                                onClick={() => setViewingLog(log)}
                                            >
                                                <Code2 className="h-4 w-4 text-slate-500" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {allLogs.length === 0 && !logsQ.isLoading && (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <Terminal className="h-12 w-12 mb-4 opacity-10" />
                                <p className="text-sm font-medium">Nenhum evento registrado nesta janela temporal.</p>
                            </div>
                        )}

                        {logsQ.hasNextPage && (
                            <div className="flex justify-center pt-4 pl-10">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl gap-2 text-xs font-semibold"
                                    onClick={() => logsQ.fetchNextPage()}
                                    disabled={logsQ.isFetchingNextPage}
                                >
                                    {logsQ.isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
                                    Carregar mais logs
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <Dialog open={Boolean(viewingLog)} onOpenChange={() => setViewingLog(null)}>
                    <DialogContent className="max-w-3xl rounded-[28px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Code2 className="h-5 w-5 text-slate-400" />
                                Raw JSON Payload
                            </DialogTitle>
                        </DialogHeader>
                        <div className="rounded-2xl bg-slate-900 p-6 shadow-inner mt-4">
                            <pre className="overflow-x-auto text-[11px] leading-relaxed text-emerald-400 font-mono max-h-[50vh]">
                                {JSON.stringify(viewingLog?.raw || {}, null, 2)}
                            </pre>
                        </div>
                        <div className="flex justify-end mt-4">
                            <Button variant="secondary" className="rounded-xl" onClick={() => setViewingLog(null)}>
                                Fechar
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
