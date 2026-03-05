import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Tag, Plus, Search, X } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";

type TagRow = {
  id: string;
  tenant_id: string;
  case_id: string;
  tag: string;
  created_at: string;
};

function normalizeTag(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function tintForTag(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  const hue = (h % 320) + 20;
  return {
    bg: `hsl(${hue} 85% 92%)`,
    fg: `hsl(${hue} 55% 28%)`,
    ring: `hsl(${hue} 70% 80%)`,
  };
}

export function CaseTagsCard(props: { tenantId: string; caseId: string }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");

  const tagsQ = useQuery({
    queryKey: ["case_tags", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_tags")
        .select("id,tenant_id,case_id,tag,created_at")
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TagRow[];
    },
  });

  const allTagsQ = useQuery({
    queryKey: ["tenant_case_tags_all", props.tenantId],
    enabled: Boolean(props.tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_tags")
        .select("tag")
        .eq("tenant_id", props.tenantId)
        .limit(5000);
      if (error) throw error;
      const tags = (data ?? [])
        .map((r: any) => normalizeTag(r.tag))
        .filter(Boolean);
      return Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b));
    },
  });

  const tags = useMemo(() => {
    const list = (tagsQ.data ?? []).map((t) => normalizeTag(t.tag)).filter(Boolean);
    return Array.from(new Set(list));
  }, [tagsQ.data]);

  const suggestions = useMemo(() => {
    const all = allTagsQ.data ?? [];
    const set = new Set(tags);
    return all.filter((t) => !set.has(t)).slice(0, 10);
  }, [allTagsQ.data, tags]);

  const visiblePickerTags = useMemo(() => {
    const qq = normalizeTag(pickerQ);
    const all = allTagsQ.data ?? [];
    const set = new Set(tags);
    const base = all.filter((t) => !set.has(t));
    if (!qq) return base.slice(0, 200);
    return base.filter((t) => t.includes(qq)).slice(0, 200);
  }, [allTagsQ.data, tags, pickerQ]);

  const logTimeline = async (message: string, meta_json: any = {}) => {
    await supabase.from("timeline_events").insert({
      tenant_id: props.tenantId,
      case_id: props.caseId,
      event_type: "tag_updated",
      actor_type: "admin",
      actor_id: user?.id ?? null,
      message,
      meta_json,
      occurred_at: new Date().toISOString(),
    });
  };

  const addTag = async (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    if (tags.includes(t)) {
      setDraft("");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("case_tags").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        tag: t,
      });
      if (error) throw error;

      await logTimeline(`Tag adicionada: ${t}`, { action: "created", tag: t });

      setDraft("");
      showSuccess("Tag adicionada.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case_tags", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["tenant_case_tags_all", props.tenantId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao adicionar tag: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tag: string) => {
    try {
      const { error } = await supabase
        .from("case_tags")
        .delete()
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .eq("tag", tag);
      if (error) throw error;

      await logTimeline(`Tag removida: ${tag}`, { action: "deleted", tag });

      showSuccess("Tag removida.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case_tags", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["tenant_case_tags_all", props.tenantId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao remover tag: ${e?.message ?? "erro"}`);
    }
  };

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <Tag className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Tags</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Organize o case por categorias</div>
          </div>
        </div>
      </div>

      {(tagsQ.isError || allTagsQ.isError) && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar tags: {((tagsQ.error as any) ?? (allTagsQ.error as any))?.message ?? ""}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(draft);
              }
            }}
            className="h-11 flex-1 rounded-2xl"
            placeholder="Adicionar tag (ex: urgente, vip, retorno)"
          />
          <Button
            onClick={() => addTag(draft)}
            disabled={saving || !normalizeTag(draft)}
            className={cn(
              "h-11 rounded-2xl px-4 text-white",
              "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            )}
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="secondary" className="h-11 rounded-2xl">
              <Search className="mr-2 h-4 w-4" /> Escolher
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] rounded-2xl border-slate-200 bg-white p-2">
            <Command className="rounded-2xl border border-slate-200">
              <CommandInput
                value={pickerQ}
                onValueChange={setPickerQ}
                placeholder="Buscar tags já criadas…"
                className="h-11"
              />
              <CommandList className="max-h-[260px]">
                <CommandEmpty>Nenhuma tag encontrada</CommandEmpty>
                <CommandGroup heading="Disponíveis">
                  {visiblePickerTags.map((t) => (
                    <CommandItem
                      key={t}
                      value={t}
                      onSelect={() => {
                        addTag(t);
                        setPickerOpen(false);
                        setPickerQ("");
                      }}
                      className="rounded-xl"
                    >
                      <span className="truncate text-sm font-medium">{t}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sugestões</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((t) => {
              const colors = tintForTag(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition hover:opacity-90"
                  style={{ background: colors.bg, color: colors.fg, boxShadow: `inset 0 0 0 1px ${colors.ring}` }}
                  title="Adicionar tag"
                >
                  + {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((t) => {
          const colors = tintForTag(t);
          return (
            <span
              key={t}
              className="group inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: colors.bg, color: colors.fg, boxShadow: `inset 0 0 0 1px ${colors.ring}` }}
              title={t}
            >
              {t}
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full bg-white/70 text-slate-700 transition hover:bg-white"
                onClick={() => remove(t)}
                title="Remover"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}

        {tags.length === 0 && !tagsQ.isError && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
            Sem tags ainda.
          </div>
        )}
      </div>
    </Card>
  );
}