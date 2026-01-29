import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { TenantBrandingPanel } from "@/components/admin/TenantBrandingPanel";
import { TenantJourneysPanel } from "@/components/admin/TenantJourneysPanel";
import { JourneyPromptsPanel } from "@/components/admin/JourneyPromptsPanel";

function slugify(s: string) {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

function decodeJwtPayload(token: string): any {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function fmtTs(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function Admin() {
  const qc = useQueryClient();
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();

  const [refreshingSession, setRefreshingSession] = useState(false);
  const [debug, setDebug] = useState<any>(null);

  const refreshSession = async () => {
    setRefreshingSession(true);
    try {
      // Important: RLS checks JWT claims. After changing app_metadata, you must refresh the access token.
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      const accessToken = data.session?.access_token ?? null;
      setDebug({
        refreshedAt: new Date().toISOString(),
        sessionUserId: data.session?.user?.id ?? null,
        sessionEmail: data.session?.user?.email ?? null,
        sessionAppMeta: data.session?.user?.app_metadata ?? null,
        jwtPayload: accessToken ? decodeJwtPayload(accessToken) : null,
      });
      showSuccess("Sessão atualizada. Se persistir, faça logout/login.");
    } catch (e: any) {
      showError(`Falha ao atualizar sessão: ${e?.message ?? "erro"}`);
    } finally {
      setRefreshingSession(false);
    }
  };

  const ensureFreshTokenForRls = async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // ignore
    }
  };

  const captureDebug = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    setDebug({
      capturedAt: new Date().toISOString(),
      sessionUserId: data.session?.user?.id ?? null,
      sessionEmail: data.session?.user?.email ?? null,
      sessionAppMeta: data.session?.user?.app_metadata ?? null,
      jwtPayload: token ? decodeJwtPayload(token) : null,
    });
  };

  // ---------------- Tenants ----------------
  const tenantsQ = useQuery({
    queryKey: ["admin_tenants"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      // As super-admin, we can see all tenants. Show soft-deleted too (for restore).
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,status,created_at,deleted_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [tenantName, setTenantName] = useState("");
  const tenantSlug = useMemo(() => slugify(tenantName), [tenantName]);
  const [creatingTenant, setCreatingTenant] = useState(false);

  const createTenant = async () => {
    if (!tenantName.trim()) return;
    setCreatingTenant(true);
    try {
      await ensureFreshTokenForRls();

      const { error } = await supabase.from("tenants").insert({
        name: tenantName.trim(),
        slug: tenantSlug || `tenant-${Date.now()}`,
        status: "active",
        branding_json: {},
      });
      if (error) throw error;
      showSuccess("Tenant criado.");
      setTenantName("");
      await qc.invalidateQueries({ queryKey: ["admin_tenants"] });
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      if (msg.toLowerCase().includes("row-level security")) {
        showError(
          "Sem permissão (RLS). Clique em “Atualizar sessão” ou faça logout/login para aplicar o claim de super-admin."
        );
      } else {
        showError(`Falha ao criar tenant: ${msg}`);
      }
      await captureDebug();
    } finally {
      setCreatingTenant(false);
    }
  };

  const restoreTenant = async (tenantId: string) => {
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("tenants")
        .update({ deleted_at: null })
        .eq("id", tenantId);
      if (error) throw error;
      showSuccess("Tenant restaurado.");
      await qc.invalidateQueries({ queryKey: ["admin_tenants"] });
    } catch (e: any) {
      showError(`Falha ao restaurar tenant: ${e?.message ?? "erro"}`);
    }
  };

  // --------------- Vendors / Leaders / Instances (per active tenant) ---------------
  const vendorsQ = useQuery({
    queryKey: ["admin_vendors", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,phone_e164,display_name,active,created_at")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const leadersQ = useQuery({
    queryKey: ["admin_leaders", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaders")
        .select("id,phone_e164,display_name,active,created_at")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tenantJourneysQ = useQuery({
    queryKey: ["admin_tenant_journeys_enabled", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,name,key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .limit(500);
      if (error) throw error;

      const opts = (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean)
        .map((j: any) => ({ id: j.id as string, name: j.name as string, key: j.key as string }));

      opts.sort((a, b) => a.name.localeCompare(b.name));
      return opts;
    },
  });

  const instancesQ = useQuery({
    queryKey: ["admin_instances", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select(
          "id,name,status,zapi_instance_id,phone_number,webhook_secret,default_journey_id,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setInstanceJourney = async (instanceId: string, journeyId: string | null) => {
    if (!activeTenantId) return;
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("wa_instances")
        .update({ default_journey_id: journeyId })
        .eq("tenant_id", activeTenantId)
        .eq("id", instanceId);
      if (error) throw error;
      showSuccess("Roteamento salvo.");
      await qc.invalidateQueries({ queryKey: ["admin_instances", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar roteamento: ${e?.message ?? "erro"}`);
    }
  };

  const [vendorPhone, setVendorPhone] = useState("+55");
  const [vendorName, setVendorName] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);

  const addVendor = async () => {
    if (!activeTenantId) return;
    setSavingVendor(true);
    try {
      await ensureFreshTokenForRls();

      const { error } = await supabase.from("vendors").insert({
        tenant_id: activeTenantId,
        phone_e164: vendorPhone.trim(),
        display_name: vendorName.trim() || null,
        active: true,
      });
      if (error) throw error;
      showSuccess("Vendedor cadastrado.");
      setVendorPhone("+55");
      setVendorName("");
      await qc.invalidateQueries({ queryKey: ["admin_vendors", activeTenantId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      if (msg.toLowerCase().includes("row-level security")) {
        showError("Sem permissão (RLS). Atualize sessão ou faça logout/login.");
      } else {
        showError(`Falha ao cadastrar vendedor: ${msg}`);
      }
      await captureDebug();
    } finally {
      setSavingVendor(false);
    }
  };

  const toggleVendor = async (id: string, active: boolean) => {
    if (!activeTenantId) return;
    try {
      await ensureFreshTokenForRls();

      const { error } = await supabase
        .from("vendors")
        .update({ active })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["admin_vendors", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar vendedor: ${e?.message ?? "erro"}`);
    }
  };

  const [leaderPhone, setLeaderPhone] = useState("+55");
  const [leaderName, setLeaderName] = useState("");
  const [savingLeader, setSavingLeader] = useState(false);

  const addLeader = async () => {
    if (!activeTenantId) return;
    setSavingLeader(true);
    try {
      await ensureFreshTokenForRls();

      const { error } = await supabase.from("leaders").insert({
        tenant_id: activeTenantId,
        phone_e164: leaderPhone.trim(),
        display_name: leaderName.trim() || null,
        active: true,
      });
      if (error) throw error;
      showSuccess("Líder cadastrado.");
      setLeaderPhone("+55");
      setLeaderName("");
      await qc.invalidateQueries({ queryKey: ["admin_leaders", activeTenantId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      if (msg.toLowerCase().includes("row-level security")) {
        showError("Sem permissão (RLS). Atualize sessão ou faça logout/login.");
      } else {
        showError(`Falha ao cadastrar líder: ${msg}`);
      }
      await captureDebug();
    } finally {
      setSavingLeader(false);
    }
  };

  const toggleLeader = async (id: string, active: boolean) => {
    if (!activeTenantId) return;
    try {
      await ensureFreshTokenForRls();

      const { error } = await supabase
        .from("leaders")
        .update({ active })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["admin_leaders", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar líder: ${e?.message ?? "erro"}`);
    }
  };

  const [instName, setInstName] = useState("Principal");
  const [instPhone, setInstPhone] = useState("+55");
  const [instZapiId, setInstZapiId] = useState("");
  const [instToken, setInstToken] = useState("");
  const [instSecret, setInstSecret] = useState("");
  const [instJourneyId, setInstJourneyId] = useState<string>("");
  const [savingInst, setSavingInst] = useState(false);

  const addInstance = async () => {
    if (!activeTenantId) return;
    setSavingInst(true);
    try {
      await ensureFreshTokenForRls();

      const { error } = await supabase.from("wa_instances").insert({
        tenant_id: activeTenantId,
        name: instName.trim() || "Instância",
        status: "active",
        zapi_instance_id: instZapiId.trim(),
        zapi_token_encrypted: instToken.trim(),
        phone_number: instPhone.trim() || null,
        webhook_secret: instSecret.trim() || crypto.randomUUID(),
        default_journey_id: instJourneyId || null,
      });
      if (error) throw error;
      showSuccess("Instância cadastrada.");
      setInstZapiId("");
      setInstToken("");
      setInstSecret("");
      setInstJourneyId("");
      await qc.invalidateQueries({ queryKey: ["admin_instances", activeTenantId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      if (msg.toLowerCase().includes("row-level security")) {
        showError("Sem permissão (RLS). Atualize sessão ou faça logout/login.");
      } else {
        showError(`Falha ao cadastrar instância: ${msg}`);
      }
      await captureDebug();
    } finally {
      setSavingInst(false);
    }
  };

  const [monitorInstanceId, setMonitorInstanceId] = useState<string>("");

  const waRecentQ = useQuery({
    queryKey: ["admin_wa_recent", activeTenantId, monitorInstanceId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("wa_messages")
        .select("id,instance_id,direction,type,from_phone,to_phone,body_text,media_url,correlation_id,occurred_at,case_id")
        .eq("tenant_id", activeTenantId!)
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (monitorInstanceId) q = q.eq("instance_id", monitorInstanceId);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const waInboxQ = useQuery({
    queryKey: ["admin_wa_inbox", activeTenantId, monitorInstanceId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("wa_webhook_inbox")
        .select("id,instance_id,ok,http_status,reason,wa_type,from_phone,to_phone,meta_json,received_at")
        .eq("tenant_id", activeTenantId!)
        .order("received_at", { ascending: false })
        .limit(50);

      if (monitorInstanceId) q = q.eq("instance_id", monitorInstanceId);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const caseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of waRecentQ.data ?? []) if ((m as any).case_id) ids.add(String((m as any).case_id));
    for (const it of waInboxQ.data ?? []) {
      const cid = (it as any)?.meta_json?.case_id;
      if (cid) ids.add(String(cid));
    }
    return Array.from(ids);
  }, [waRecentQ.data, waInboxQ.data]);

  const casesLookupQ = useQuery({
    queryKey: ["admin_cases_lookup", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,title,journey_id,journeys(key,name)")
        .eq("tenant_id", activeTenantId!)
        .in("id", caseIds);
      if (error) throw error;
      const map = new Map<string, any>();
      for (const c of data ?? []) map.set((c as any).id, c);
      return map;
    },
  });

  if (!isSuperAdmin) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
            Esta área é exclusiva do super-admin.
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  const deletedCount = (tenantsQ.data ?? []).filter((t: any) => t.deleted_at).length;

  const instanceById = useMemo(() => {
    const m = new Map<string, any>();
    for (const it of instancesQ.data ?? []) m.set(it.id, it);
    return m;
  }, [instancesQ.data]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Admin</h2>
              <p className="mt-1 text-sm text-slate-600">
                Gestão do microsaas (super-admin): tenants, pessoas e integrações.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="secondary"
                className="h-10 rounded-2xl"
                onClick={refreshSession}
                disabled={refreshingSession}
              >
                {refreshingSession ? "Atualizando…" : "Atualizar sessão"}
              </Button>
              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm">
                Tenant ativo: <span className="font-medium text-slate-900">{activeTenant?.name ?? "—"}</span>
                <span className="text-slate-400"> • </span>
                <span className="text-slate-500">Troque pelo botão "Trocar".</span>
              </div>
            </div>
          </div>

          {debug && (
            <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Diagnóstico do token (RLS)</div>
                <Button variant="secondary" className="h-9 rounded-2xl" onClick={captureDebug}>
                  Recarregar
                </Button>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Procure por <span className="font-medium">jwtPayload.app_metadata.byfrost_super_admin</span>.
              </div>
              <pre className="mt-3 max-h-[280px] overflow-auto rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-700">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-5">
            <Tabs defaultValue="tenants">
              <TabsList className="rounded-2xl bg-white/70 p-1">
                <TabsTrigger value="tenants" className="rounded-xl">Tenants</TabsTrigger>
                <TabsTrigger value="journeys" className="rounded-xl">Jornadas</TabsTrigger>
                <TabsTrigger value="prompts" className="rounded-xl">Prompts</TabsTrigger>
                <TabsTrigger value="people" className="rounded-xl">Vendedores & Líderes</TabsTrigger>
                <TabsTrigger value="whatsapp" className="rounded-xl">WhatsApp</TabsTrigger>
                <TabsTrigger value="branding" className="rounded-xl">Branding</TabsTrigger>
              </TabsList>

              <TabsContent value="tenants" className="mt-4">
                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Criar tenant</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Para o MVP, o super-admin pode criar tenants diretamente.
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div>
                        <Label className="text-xs">Nome</Label>
                        <Input
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          className="mt-1 rounded-2xl"
                          placeholder="Ex: Loja Centro"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Slug (auto)</Label>
                        <Input
                          value={tenantSlug}
                          readOnly
                          className="mt-1 rounded-2xl bg-slate-50"
                        />
                      </div>
                      <Button
                        onClick={createTenant}
                        disabled={creatingTenant || !tenantName.trim()}
                        className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                      >
                        {creatingTenant ? "Criando…" : "Criar tenant"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">Tenants</div>
                      <div className="text-xs text-slate-500">
                        {(tenantsQ.data?.length ?? 0)}{deletedCount ? ` • ${deletedCount} deletado(s)` : ""}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {(tenantsQ.data ?? []).map((t: any) => {
                        const softDeleted = Boolean(t.deleted_at);
                        return (
                          <div
                            key={t.id}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2",
                              softDeleted
                                ? "border-rose-200 bg-rose-50"
                                : "border-slate-200 bg-slate-50"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                              <div className="mt-0.5 truncate text-xs text-slate-500">/{t.slug}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {softDeleted ? (
                                <Badge className="rounded-full border-0 bg-rose-100 text-rose-900 hover:bg-rose-100">
                                  deletado
                                </Badge>
                              ) : (
                                <Badge
                                  className={cn(
                                    "rounded-full border-0",
                                    t.status === "active"
                                      ? "bg-emerald-100 text-emerald-900"
                                      : "bg-slate-100 text-slate-700"
                                  )}
                                >
                                  {t.status}
                                </Badge>
                              )}
                              {softDeleted && (
                                <Button
                                  variant="secondary"
                                  className="h-9 rounded-2xl"
                                  onClick={() => restoreTenant(t.id)}
                                >
                                  Restaurar
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {(tenantsQ.data ?? []).length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                          Nenhum tenant encontrado.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="journeys" className="mt-4">
                <TenantJourneysPanel />
              </TabsContent>

              <TabsContent value="prompts" className="mt-4">
                <JourneyPromptsPanel />
              </TabsContent>

              <TabsContent value="people" className="mt-4">
                {!activeTenantId ? (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Selecione um tenant (botão "Trocar") para cadastrar vendedores e líderes.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Vendedores</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Identificação do vendedor é pelo número WhatsApp (E.164).
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div>
                          <Label className="text-xs">Telefone (E.164)</Label>
                          <Input
                            value={vendorPhone}
                            onChange={(e) => setVendorPhone(e.target.value)}
                            className="mt-1 rounded-2xl"
                            placeholder="+5511999999999"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Nome (opcional)</Label>
                          <Input
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            className="mt-1 rounded-2xl"
                            placeholder="Ex: João"
                          />
                        </div>
                        <Button
                          onClick={addVendor}
                          disabled={savingVendor || vendorPhone.trim().length < 8}
                          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                        >
                          {savingVendor ? "Salvando…" : "Cadastrar vendedor"}
                        </Button>
                      </div>

                      <div className="mt-4 space-y-2">
                        {(vendorsQ.data ?? []).map((v: any) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {v.display_name ?? "(sem nome)"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-slate-500">{v.phone_e164}</div>
                            </div>
                            <Button
                              variant="secondary"
                              className="h-9 rounded-2xl"
                              onClick={() => toggleVendor(v.id, !v.active)}
                            >
                              {v.active ? "Desativar" : "Ativar"}
                            </Button>
                          </div>
                        ))}
                        {(vendorsQ.data ?? []).length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                            Nenhum vendedor cadastrado.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Líderes</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Recebem escalonamento quando pendência do vendedor estoura SLA.
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div>
                          <Label className="text-xs">Telefone (E.164)</Label>
                          <Input
                            value={leaderPhone}
                            onChange={(e) => setLeaderPhone(e.target.value)}
                            className="mt-1 rounded-2xl"
                            placeholder="+5511999990000"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Nome (opcional)</Label>
                          <Input
                            value={leaderName}
                            onChange={(e) => setLeaderName(e.target.value)}
                            className="mt-1 rounded-2xl"
                            placeholder="Ex: Maria"
                          />
                        </div>
                        <Button
                          onClick={addLeader}
                          disabled={savingLeader || leaderPhone.trim().length < 8}
                          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                        >
                          {savingLeader ? "Salvando…" : "Cadastrar líder"}
                        </Button>
                      </div>

                      <div className="mt-4 space-y-2">
                        {(leadersQ.data ?? []).map((l: any) => (
                          <div
                            key={l.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {l.display_name ?? "(sem nome)"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-slate-500">{l.phone_e164}</div>
                            </div>
                            <Button
                              variant="secondary"
                              className="h-9 rounded-2xl"
                              onClick={() => toggleLeader(l.id, !l.active)}
                            >
                              {l.active ? "Desativar" : "Ativar"}
                            </Button>
                          </div>
                        ))}
                        {(leadersQ.data ?? []).length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                            Nenhum líder cadastrado.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="whatsapp" className="mt-4">
                {!activeTenantId ? (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Selecione um tenant (botão "Trocar") para cadastrar instâncias WhatsApp.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-900">Cadastrar instância</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Defina a jornada padrão para onde o webhook vai rotear mensagens inbound.
                        </div>

                        <div className="mt-4 grid gap-3">
                          <div>
                            <Label className="text-xs">Nome</Label>
                            <Input
                              value={instName}
                              onChange={(e) => setInstName(e.target.value)}
                              className="mt-1 rounded-2xl"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Phone number (opcional)</Label>
                            <Input
                              value={instPhone}
                              onChange={(e) => setInstPhone(e.target.value)}
                              className="mt-1 rounded-2xl"
                              placeholder="+5511888888888"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Z-API instance id</Label>
                            <Input
                              value={instZapiId}
                              onChange={(e) => setInstZapiId(e.target.value)}
                              className="mt-1 rounded-2xl"
                              placeholder="abc123"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Z-API token</Label>
                            <Input
                              value={instToken}
                              onChange={(e) => setInstToken(e.target.value)}
                              className="mt-1 rounded-2xl"
                              placeholder="token"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Webhook secret</Label>
                            <Input
                              value={instSecret}
                              onChange={(e) => setInstSecret(e.target.value)}
                              className="mt-1 rounded-2xl"
                              placeholder="secreto (ou deixe vazio para gerar)"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Jornada padrão (inbound)</Label>
                            <select
                              value={instJourneyId}
                              onChange={(e) => setInstJourneyId(e.target.value)}
                              className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-[hsl(var(--byfrost-accent)/0.45)] outline-none"
                            >
                              <option value="">(fallback)</option>
                              {(tenantJourneysQ.data ?? []).map((j) => (
                                <option key={j.id} value={j.id}>
                                  {j.name}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 text-[11px] text-slate-500">
                              Se vazio, o webhook tenta usar a primeira jornada habilitada do tenant; se não existir, usa sales_order.
                            </div>
                          </div>

                          <Button
                            onClick={addInstance}
                            disabled={savingInst || !instZapiId.trim() || !instToken.trim()}
                            className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                          >
                            {savingInst ? "Salvando…" : "Cadastrar instância"}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">Instâncias do tenant</div>
                          <div className="text-xs text-slate-500">{instancesQ.data?.length ?? 0}</div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {(instancesQ.data ?? []).map((i: any) => {
                            const pathUrl = `https://pryoirzeghatrgecwrci.supabase.co/functions/v1/webhooks-zapi-inbound/${encodeURIComponent(
                              i.zapi_instance_id
                            )}/${encodeURIComponent(i.webhook_secret)}`;
                            return (
                              <div
                                key={i.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900">
                                      {i.name}
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-500 truncate">
                                      zapi_instance_id: {i.zapi_instance_id}
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-500 truncate">
                                      webhook_secret: {i.webhook_secret}
                                    </div>
                                  </div>
                                  <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                    {i.status}
                                  </Badge>
                                </div>

                                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-2">
                                  <div className="text-[11px] font-semibold text-slate-700">Webhook URL (sem header/query)</div>
                                  <div className="mt-1 rounded-xl bg-slate-50 px-2 py-1 text-[11px] text-slate-700 break-all">
                                    {pathUrl}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    Cole essa URL no Z-API. Ela já carrega <span className="font-medium">instanceId</span> e <span className="font-medium">secret</span> no caminho.
                                  </div>
                                </div>

                                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-2">
                                  <div className="text-[11px] font-semibold text-slate-700">Roteamento inbound</div>
                                  <select
                                    value={i.default_journey_id ?? ""}
                                    onChange={(e) =>
                                      setInstanceJourney(i.id, e.target.value ? e.target.value : null)
                                    }
                                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                                  >
                                    <option value="">(fallback)</option>
                                    {(tenantJourneysQ.data ?? []).map((j) => (
                                      <option key={j.id} value={j.id}>
                                        {j.name}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    Define em qual jornada cada nova conversa/caso será criado.
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {(instancesQ.data ?? []).length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                              Nenhuma instância cadastrada.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Monitor de eventos (Z-API → Byfrost)</div>
                          <div className="mt-1 text-xs text-slate-600">
                            Se o webhook estiver chegando, você verá entradas novas em <span className="font-medium">wa_messages</span> e em <span className="font-medium">wa_webhook_inbox</span>.
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                            <div className="text-[11px] font-semibold text-slate-700">Instância</div>
                            <select
                              value={monitorInstanceId}
                              onChange={(e) => setMonitorInstanceId(e.target.value)}
                              className="mt-1 h-9 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                            >
                              <option value="">(todas)</option>
                              {(instancesQ.data ?? []).map((i: any) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Button
                            variant="secondary"
                            className="h-10 rounded-2xl"
                            onClick={() => {
                              waRecentQ.refetch();
                              waInboxQ.refetch();
                            }}
                          >
                            Atualizar
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden rounded-[18px] border border-slate-200">
                          <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                            wa_messages (armazenamento)
                          </div>
                          <div className="grid grid-cols-[140px_96px_110px_1fr] gap-0 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold text-slate-600">
                            <div>Quando</div>
                            <div>Direção</div>
                            <div>Tipo</div>
                            <div>Resumo</div>
                          </div>

                          <div className="divide-y divide-slate-200 bg-white">
                            {(waRecentQ.data ?? []).map((m: any) => {
                              const inst = instanceById.get(m.instance_id);
                              const summary =
                                m.type === "image"
                                  ? (m.media_url ? `Imagem: ${m.media_url}` : "Imagem")
                                  : m.type === "location"
                                    ? "Localização"
                                    : (m.body_text ?? "(sem texto)");

                              const c = m.case_id ? casesLookupQ.data?.get(String(m.case_id)) : null;
                              const j = (c as any)?.journeys;

                              return (
                                <div
                                  key={m.id}
                                  className="grid grid-cols-[140px_96px_110px_1fr] items-start gap-0 px-3 py-2"
                                >
                                  <div className="text-[11px] text-slate-600">
                                    <div className="font-medium text-slate-900">{fmtTs(m.occurred_at)}</div>
                                    <div className="mt-0.5 text-slate-500 truncate">{inst?.name ?? "—"}</div>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge
                                      className={cn(
                                        "rounded-full border-0",
                                        m.direction === "inbound"
                                          ? "bg-indigo-100 text-indigo-900 hover:bg-indigo-100"
                                          : "bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                                      )}
                                    >
                                      {m.direction}
                                    </Badge>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                                      {m.type}
                                    </Badge>
                                  </div>

                                  <div className="min-w-0">
                                    <div className="text-xs text-slate-900 truncate">{summary}</div>
                                    <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                                      {m.from_phone ? `de ${m.from_phone}` : ""}
                                      {m.to_phone ? ` → ${m.to_phone}` : ""}
                                      {m.case_id ? ` • case ${String(m.case_id).slice(0, 8)}…` : " • sem case"}
                                      {j?.key ? ` • ${j.key}` : ""}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {waRecentQ.isError && (
                              <div className="px-3 py-3 text-sm text-rose-700">
                                Erro ao carregar wa_messages: {(waRecentQ.error as any)?.message ?? ""}
                              </div>
                            )}

                            {(waRecentQ.data ?? []).length === 0 && !waRecentQ.isError && (
                              <div className="px-3 py-6 text-center text-sm text-slate-500">
                                Nenhum evento ainda.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-[18px] border border-slate-200">
                          <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                            wa_webhook_inbox (diagnóstico do roteamento)
                          </div>
                          <div className="grid grid-cols-[120px_70px_90px_1fr] gap-0 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold text-slate-600">
                            <div>Quando</div>
                            <div>OK</div>
                            <div>Tipo</div>
                            <div>Roteamento</div>
                          </div>

                          <div className="divide-y divide-slate-200 bg-white">
                            {(waInboxQ.data ?? []).map((it: any) => {
                              const cid = it?.meta_json?.case_id ? String(it.meta_json.case_id) : "";
                              const c = cid ? casesLookupQ.data?.get(cid) : null;
                              const j = (c as any)?.journeys;
                              const reason = it.reason ? String(it.reason) : "";

                              return (
                                <div
                                  key={it.id}
                                  className="grid grid-cols-[120px_70px_90px_1fr] items-start gap-0 px-3 py-2"
                                >
                                  <div className="text-[11px] text-slate-600">
                                    <div className="font-medium text-slate-900">{fmtTs(it.received_at)}</div>
                                    <div className="mt-0.5 text-slate-500 truncate">{it.http_status ?? ""}</div>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge
                                      className={cn(
                                        "rounded-full border-0",
                                        it.ok ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"
                                      )}
                                    >
                                      {it.ok ? "ok" : "fail"}
                                    </Badge>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">
                                      {it.wa_type ?? "—"}
                                    </Badge>
                                  </div>

                                  <div className="min-w-0">
                                    <div className="text-xs text-slate-900 truncate">
                                      {cid ? `case ${cid.slice(0, 8)}…` : "sem case"}
                                      {j?.key ? ` • ${j.key}` : ""}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                                      {reason ? `motivo: ${reason}` : ""}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {waInboxQ.isError && (
                              <div className="px-3 py-3 text-sm text-rose-700">
                                Erro ao carregar wa_webhook_inbox: {(waInboxQ.error as any)?.message ?? ""}
                              </div>
                            )}

                            {(waInboxQ.data ?? []).length === 0 && !waInboxQ.isError && (
                              <div className="px-3 py-6 text-center text-sm text-slate-500">
                                Nenhum diagnóstico ainda.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        Se aparecer <span className="font-medium">sem case</span> com motivo <span className="font-medium">create_case_disabled_text</span>, habilite em Admin → Jornadas → Automação → "Criar case ao receber texto".
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="branding" className="mt-4">
                <TenantBrandingPanel />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}