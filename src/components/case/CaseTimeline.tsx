import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  User,
} from "lucide-react";

export type CaseTimelineEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  message: string | null;
  occurred_at: string;
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function iconFor(e: CaseTimelineEvent) {
  const t = String(e.event_type ?? "").toLowerCase();

  if (t.includes("approved") || t.includes("approval") || t.includes("confirmed")) return UserCheck;
  if (t.includes("doc") || t.includes("contract") || t.includes("attachment")) return FileText;
  if (t.includes("image") || t.includes("photo") || t.includes("ocr")) return ImageIcon;
  if (t.includes("location")) return MapPin;
  if (t.includes("message") || t.includes("reply") || t.includes("whatsapp")) return MessageSquareText;
  if (t.includes("decision") || t.includes("ai") || t.includes("why")) return Sparkles;
  if (t.includes("govern") || t.includes("audit")) return ShieldCheck;

  return CheckCircle2;
}

function toneFor(e: CaseTimelineEvent) {
  const t = String(e.event_type ?? "").toLowerCase();
  if (t.includes("fail") || t.includes("error")) return "rose";
  if (t.includes("pending") || t.includes("pendency")) return "amber";
  return "emerald";
}

function actorLabel(actorType: string) {
  const t = String(actorType ?? "").toLowerCase();
  if (t === "admin") return "Painel";
  if (t === "vendor") return "Vendedor";
  if (t === "customer") return "Cliente";
  if (t === "leader") return "Líder";
  if (t === "ai") return "IA";
  if (t === "system") return "Sistema";
  return actorType;
}

export function CaseTimeline({ events }: { events: CaseTimelineEvent[] }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Timeline</div>
        <div className="text-xs text-slate-500">{events.length} evento(s)</div>
      </div>

      <div className="mt-4">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
            Sem eventos ainda.
          </div>
        ) : (
          <ol className="space-y-5">
            {events.map((e, idx) => {
              const Icon = iconFor(e);
              const tone = toneFor(e);
              const isLast = idx === events.length - 1;

              const ring =
                tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : tone === "amber"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700";

              const actorSource = actorLabel(e.actor_type);
              const actorDisplay = e.actor_name
                ? `${actorSource} · ${e.actor_name}`
                : actorSource;

              return (
                <li key={e.id} className="relative">
                  {!isLast && <div className="absolute left-[14px] top-7 bottom-[-22px] w-px bg-slate-200" />}

                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "z-10 mt-0.5 h-7 w-7 flex-shrink-0 rounded-full border grid place-items-center",
                        ring
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">{fmt(e.occurred_at)}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {e.message ?? "(sem mensagem)"}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {e.actor_name && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                            <User className="h-2.5 w-2.5" />
                            {e.actor_name}
                          </span>
                        )}
                        <span>{actorSource}</span>
                        <span>•</span>
                        <span>{e.event_type}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}