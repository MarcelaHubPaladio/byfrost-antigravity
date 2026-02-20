import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Terminal, Code2, CheckCircle2, XCircle, Info, Clock, Database, MessageSquare, ArrowRightLeft } from "lucide-react";

interface AuditLogsPanelProps {
    caseId: string;
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
    raw: any;
}

export function AuditLogsPanel({ caseId, tenantId }: AuditLogsPanelProps) {
    const [viewingLog, setViewingLog] = useState<UnifiedLog | null>(null);

    const inboxQ = useQuery({
        queryKey: ["audit_inbox", tenantId, caseId],
        enabled: Boolean(tenantId && caseId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("wa_webhook_inbox")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("meta_json->>case_id", caseId)
                .order("received_at", { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        },
    });

    const messagesQ = useQuery({
        queryKey: ["audit_messages", tenantId, caseId],
        enabled: Boolean(tenantId && caseId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("wa_messages")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("case_id", caseId)
                .order("occurred_at", { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        },
    });

    const unifiedLogs = useMemo(() => {
        const logs: UnifiedLog[] = [];

        (inboxQ.data ?? []).forEach(it => {
            logs.push({
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
                raw: { payload: it.payload_json, meta: it.meta_json }
            });
        });

        (messagesQ.data ?? []).forEach(m => {
            logs.push({
                id: `msg-${m.id}`,
                type: 'message',
                timestamp: m.occurred_at,
                ok: true,
                direction: m.direction,
                wa_type: m.type,
                body: m.body_text,
                from: m.from_phone,
                to: m.to_phone,
                raw: m
            });
        });

        return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [inboxQ.data, messagesQ.data]);

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
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Terminal className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                    Timeline Técnica de Auditoria
                </h3>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                        <div className="h-2 w-2 rounded-full bg-slate-400" /> Webhook Inbound
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--byfrost-accent))] font-medium">
                        <div className="h-2 w-2 rounded-full bg-[hsl(var(--byfrost-accent))]" /> Mensagem Salva
                    </div>
                </div>
            </div>

            <div className="relative space-y-3 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                {unifiedLogs.map((log) => {
                    const isWebhook = log.type === 'webhook';
                    const isOk = log.ok;

                    return (
                        <div key={log.id} className="relative pl-9">
                            {/* Dot */}
                            <div
                                className={cn(
                                    "absolute left-1 top-1.5 h-5 w-5 rounded-full border-4 border-white shadow-sm ring-1 ring-slate-200",
                                    isWebhook ? (isOk ? "bg-emerald-500" : "bg-rose-500") : "bg-[hsl(var(--byfrost-accent))]"
                                )}
                            />

                            <div className={cn(
                                "group rounded-2xl border p-3 transition hover:shadow-sm",
                                isWebhook ? "bg-slate-50/50 border-slate-200 hover:bg-white" : "bg-white border-[hsl(var(--byfrost-accent)/0.15)] shadow-[0_2px_10px_-4px_rgba(var(--byfrost-accent-rgb),0.1)]"
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-3 w-3 text-slate-400" />
                                            <span className="text-[11px] font-medium text-slate-500">{fmtTs(log.timestamp)}</span>

                                            {isWebhook ? (
                                                <>
                                                    <Badge variant="secondary" className={cn(
                                                        "h-5 rounded-lg px-1.5 text-[9px] uppercase font-bold",
                                                        isOk ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                                    )}>
                                                        WEBHOOK {isOk ? "SUCCESS" : "FAIL"}
                                                    </Badge>
                                                    {log.status && <span className="text-[10px] font-mono text-slate-400">HTTP {log.status}</span>}
                                                </>
                                            ) : (
                                                <Badge variant="secondary" className="h-5 rounded-lg px-1.5 text-[9px] uppercase font-bold bg-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))]">
                                                    DATABASE RECORD
                                                </Badge>
                                            )}

                                            <Badge variant="outline" className={cn(
                                                "h-5 rounded-lg border-0 bg-slate-100 px-1.5 text-[9px] font-bold uppercase",
                                                log.direction === 'inbound' ? "text-indigo-600" : "text-emerald-600"
                                            )}>
                                                {log.direction}
                                            </Badge>
                                        </div>

                                        <div className="mt-2 flex items-start gap-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    {isWebhook ? <ArrowRightLeft className="h-3 w-3 text-slate-400" /> : <Database className="h-3 w-3 text-slate-400" />}
                                                    <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                                                        {log.wa_type || 'event'}
                                                    </span>
                                                </div>
                                                {(log.from || log.to) && (
                                                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                                                        {log.direction === 'inbound' ? `from: ${log.from}` : `to: ${log.to}`}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {isWebhook ? (
                                                    log.reason && (
                                                        <div className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-0.5 shadow-xs">
                                                            <Info className="h-3 w-3 text-amber-500" />
                                                            <span className="text-[10px] font-semibold text-slate-600">
                                                                {log.reason}
                                                            </span>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="rounded-lg bg-[hsl(var(--byfrost-accent)/0.03)] border border-[hsl(var(--byfrost-accent)/0.1)] px-2 py-1">
                                                        <p className="text-[11px] text-slate-700 line-clamp-2 leading-relaxed italic">
                                                            "{log.body || (log.wa_type === 'text' ? '(vazio)' : `[Mídia: ${log.wa_type}]`)}"
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 rounded-xl bg-white shadow-xs border border-slate-100 opacity-0 group-hover:opacity-100 transition"
                                        onClick={() => setViewingLog(log)}
                                        title="Ver JSON completo"
                                    >
                                        <Code2 className="h-4 w-4 text-slate-500" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {unifiedLogs.length === 0 && !inboxQ.isLoading && !messagesQ.isLoading && (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 p-12 text-center text-slate-500">
                        <Clock className="mb-3 h-8 w-8 text-slate-300" />
                        <div className="text-sm font-medium">Nenhum evento registrado ainda</div>
                        <div className="mt-1 text-xs">Aguarde a próxima mensagem para ver o fluxo de depuração.</div>
                    </div>
                )}

                {(inboxQ.isLoading || messagesQ.isLoading) && (
                    <div className="space-y-3 animate-pulse">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 rounded-2xl bg-slate-100 mx-9" />
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={Boolean(viewingLog)} onOpenChange={() => setViewingLog(null)}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col rounded-[28px] border-slate-200 p-0 shadow-2xl">
                    <DialogHeader className="p-6 pb-2">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-2xl",
                                viewingLog?.type === 'webhook'
                                    ? (viewingLog?.ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")
                                    : "bg-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))]"
                            )}>
                                {viewingLog?.type === 'webhook' ? (
                                    viewingLog?.ok ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />
                                ) : <Database className="h-6 w-6" />}
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold">
                                    {viewingLog?.type === 'webhook' ? 'Webhook Diagnostic' : 'Database Message Record'}
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    {viewingLog && fmtTs(viewingLog.timestamp)}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="rounded-lg bg-slate-100 uppercase">
                                        {viewingLog?.type}
                                    </Badge>
                                    <span className="text-sm font-mono text-slate-700">{viewingLog?.wa_type}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Summary</div>
                                <div className="text-sm font-semibold text-slate-900">
                                    {viewingLog?.reason || viewingLog?.body || '—'}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 font-mono">
                                    RAW_DATA.json
                                </h4>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 shadow-inner">
                                <pre className="overflow-x-auto text-[11px] leading-relaxed text-emerald-400 font-mono">
                                    {JSON.stringify(viewingLog?.raw || {}, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 p-4 bg-slate-50/50 flex justify-end">
                        <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setViewingLog(null)}>
                            Fechar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
