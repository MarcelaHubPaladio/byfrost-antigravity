import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { TenantBrandingPanel } from "@/components/admin/TenantBrandingPanel";
import { TenantJourneysPanel } from "@/components/admin/TenantJourneysPanel";
import { JourneyPromptsPanel } from "@/components/admin/JourneyPromptsPanel";
import { AccessMatrixPanel } from "@/components/admin/AccessMatrixPanel";
import { Trash2, PauseCircle, PlayCircle, ChevronLeft, ChevronRight, UsersRound, Smartphone, Copy, Shield } from "lucide-react";

type UserRole = string;

type TenantUserRow = {
  user_id: string;
  tenant_id: string;
  role: UserRole;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  created_at: string;
  deleted_at: string | null;
};

type JourneyOpt = { id: string; name: string; key: string };

type WaInstanceRow = {
  id: string;
  name: string;
  status: "active" | "paused" | "disabled";
  zapi_instance_id: string | null;
  phone_number: string | null;
  webhook_secret: string;
  default_journey_id: string | null;
  assigned_user_id: string | null;
  created_at: string;
};

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

function PaginationControls({
  page,
  pageSize,
  count,
  onPage,
}: {
  page: number;
  pageSize: number;
  count: number;
  onPage: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  return (
    <div className="flex flex-col items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 sm:flex-row">
      <div className="text-[11px] text-slate-600">
        Página <span className="font-semibold text-slate-900">{page + 1}</span> de{" "}
        <span className="font-semibold text-slate-900">{totalPages}</span>
        <span className="text-slate-400"> • </span>
        <span className="text-slate-500">{count} itens</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="h-9 rounded-2xl"
          disabled={!canPrev}
          onClick={() => onPage(Math.max(0, page - 1))}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>
        <Button
          variant="secondary"
          className="h-9 rounded-2xl"
          disabled={!canNext}
          onClick={() => onPage(page + 1)}
        >
          Próxima
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function roleLabel(r: UserRole) {
  // Fallback para roles customizados
  if (r === "admin") return "Admin";
  if (r === "manager") return "Gerente";
  if (r === "supervisor") return "Supervisor";
  if (r === "vendor") return "Vendedor";
  if (r === "leader") return "Líder";
  return r;
}

function normalizePhoneLoose(v: string) {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export default function Admin() {
  const qc = useQueryClient();
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();

  // Super-admin bootstrap helper (edge function checks allowlist APP_SUPER_ADMIN_EMAILS)
  const ADMIN_SET_SUPERADMIN_URL =
    "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/admin-set-super-admin";
  const ADMIN_LIST_SUPERADMINS_URL =
    "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/admin-super-admins-list";

  const [refreshingSession, setRefreshingSession] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  const [deletingInstanceId, setDeletingInstanceId] = useState<string | null>(null);
  const [updatingInstanceId, setUpdatingInstanceId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [addingSelf, setAddingSelf] = useState(false);
  const [selfRole, setSelfRole] = useState<UserRole>("admin");

  const [inviteLink, setInviteLink] = useState<string>("");
  const [inviteTempPassword, setInviteTempPassword] = useState<string>("");
  const [inviteLinkOpen, setInviteLinkOpen] = useState(false);

  const [superAdminEmail, setSuperAdminEmail] = useState("");
  const [settingSuperAdmin, setSettingSuperAdmin] = useState(false);

  const ensureFreshTokenForRls = async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // ignore
    }
  };

  const refreshSession = async () => {
    setRefreshingSession(true);
    try {
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
          'Sem permissão (RLS). Clique em "Atualizar sessão" ou faça logout/login para aplicar o claim de super-admin.'
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
      const { error } = await supabase.from("tenants").update({ deleted_at: null }).eq("id", tenantId);
      if (error) throw error;
      showSuccess("Tenant restaurado.");
      await qc.invalidateQueries({ queryKey: ["admin_tenants"] });
    } catch (e: any) {
      showError(`Falha ao restaurar tenant: ${e?.message ?? "erro"}`);
    }
  };

  // ---------------- Users (per active tenant) ----------------
  const usersQ = useQuery({
    queryKey: ["admin_tenant_users", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id,tenant_id,role,display_name,phone_e164,email,created_at,deleted_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TenantUserRow[];
    },
  });

  const userOptions = useMemo(() => {
    const list = (usersQ.data ?? []).map((u) => ({
      id: u.user_id,
      label: u.display_name || u.email || `${u.user_id.slice(0, 8)}…`,
      role: u.role,
      phone: u.phone_e164,
      email: u.email,
    }));

    list.sort((a, b) => a.label.localeCompare(b.label));
    return list;
  }, [usersQ.data]);

  const tenantRolesQ = useQuery({
    queryKey: ["admin_tenant_roles", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("role_id, roles(key,name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const mapped = rows
        .map((r) => ({
          key: String(r.roles?.key ?? ""),
          name: String(r.roles?.name ?? ""),
        }))
        .filter((r) => Boolean(r.key));
      mapped.sort((a, b) => a.name.localeCompare(b.name));
      return mapped as { key: string; name: string }[];
    },
  });

  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invPhone, setInvPhone] = useState("+55");
  const [invRole, setInvRole] = useState<UserRole>("vendor");
  const [inviting, setInviting] = useState(false);

  const setSuperAdminByEmail = async (emailInput: string, set: boolean) => {
    const email = emailInput.trim().toLowerCase();
    if (!email.includes("@")) {
      showError("Informe um email válido.");
      return;
    }

    setSettingSuperAdmin(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(ADMIN_SET_SUPERADMIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, set }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      showSuccess(
        set
          ? "Super-admin ativado para este email. A pessoa precisa fazer logout/login para o token carregar o claim."
          : "Super-admin removido para este email."
      );
      setSuperAdminEmail("");
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      if (msg.toLowerCase().includes("forbidden")) {
        showError(
          "Sem permissão para promover super-admin. Verifique o Secret APP_SUPER_ADMIN_EMAILS nas Edge Functions (allowlist de bootstrap)."
        );
      } else if (msg.toLowerCase().includes("target user not found")) {
        showError("Usuário não encontrado no Auth. Ele precisa se cadastrar/entrar ao menos uma vez.");
      } else {
        showError(`Falha ao atualizar super-admin: ${msg}`);
      }
    } finally {
      setSettingSuperAdmin(false);
    }
  };

  const superAdminsQ = useQuery({
    queryKey: ["admin_super_admins_list"],
    enabled: Boolean(isSuperAdmin),
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(ADMIN_LIST_SUPERADMINS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      return (json.rows ?? []) as any[];
    },
  });

  const invitesQ = useQuery({
    queryKey: ["admin_user_invites", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_invites")
        .select("id,tenant_id,user_id,email,sent_email,invite_link,created_by_user_id,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const openInviteLink = (link: string, tempPassword?: string) => {
    if (!link && !tempPassword) return;
    setInviteLink(link || "");
    setInviteTempPassword(tempPassword || "");
    setInviteLinkOpen(true);
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      showSuccess("Link copiado.");
    } catch {
      showError("Não consegui copiar automaticamente. Selecione e copie manualmente.");
    }
  };

  const copyTempPassword = async () => {
    if (!inviteTempPassword) return;
    try {
      await navigator.clipboard.writeText(inviteTempPassword);
      showSuccess("Senha temporária copiada.");
    } catch {
      showError("Não consegui copiar automaticamente. Selecione e copie manualmente.");
    }
  };

  const inviteUser = async () => {
    if (!activeTenantId) return;
    const email = invEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      showError("Informe um email válido.");
      return;
    }

    setInviting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;
      if (!token) throw new Error("Sessão inválida");

      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/admin-invite-user";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          email,
          role: invRole,
          displayName: invName.trim() || null,
          phoneE164: normalizePhoneLoose(invPhone),
          // Use callback as base; the edge function derives /auth/reset for recovery link
          redirectTo: `${window.location.origin}/auth/callback`,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }

      const link = typeof json?.inviteLink === "string" ? json.inviteLink : "";
      const tempPassword = typeof json?.tempPassword === "string" ? json.tempPassword : "";
      const createdNewUser = Boolean(json?.createdNewUser);

      if (createdNewUser) {
        showSuccess("Usuário criado. Envie a senha temporária ou o link de reset para o 1º acesso.");
      } else {
        showSuccess("Vínculo atualizado. Envie o link de reset para o usuário acessar/definir senha.");
      }

      if (link || tempPassword) openInviteLink(link, tempPassword);

      setInvEmail("");
      setInvName("");
      setInvPhone("+55");
      setInvRole("vendor");

      await qc.invalidateQueries({ queryKey: ["admin_tenant_users", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["admin_user_invites", activeTenantId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      if (msg.toLowerCase().includes("unauthorized")) {
        showError(
          "Falha ao convidar usuário: Unauthorized. Isso normalmente acontece quando o frontend está autenticado em um projeto Supabase diferente das Edge Functions. Verifique VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ou recarregue e faça logout/login."
        );
      } else {
        showError(`Falha ao convidar usuário: ${msg}`);
      }
    } finally {
      setInviting(false);
    }
  };

  const updateUserProfile = async (u: TenantUserRow, patch: Partial<TenantUserRow>) => {
    if (!activeTenantId) return;
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("users_profile")
        .update({
          display_name: patch.display_name ?? u.display_name,
          email: patch.email ?? u.email,
          phone_e164: patch.phone_e164 ?? u.phone_e164,
          role: (patch.role ?? u.role) as any,
        })
        .eq("tenant_id", activeTenantId)
        .eq("user_id", u.user_id);
      if (error) throw error;

      showSuccess("Usuário atualizado.");
      await qc.invalidateQueries({ queryKey: ["admin_tenant_users", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar usuário: ${e?.message ?? "erro"}`);
    }
  };

  const removeUserFromTenant = async (u: TenantUserRow) => {
    if (!activeTenantId) return;
    setDeletingUserId(u.user_id);
    try {
      await ensureFreshTokenForRls();

      // 1) Remove acesso do tenant (soft delete)
      const { error: profErr } = await supabase
        .from("users_profile")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", activeTenantId)
        .eq("user_id", u.user_id);
      if (profErr) throw profErr;

      // 2) Se ele estava responsável por instâncias, desatribui
      const { error: instErr } = await supabase
        .from("wa_instances")
        .update({ assigned_user_id: null })
        .eq("tenant_id", activeTenantId)
        .eq("assigned_user_id", u.user_id);
      if (instErr) throw instErr;

      showSuccess("Usuário removido do tenant.");
      await qc.invalidateQueries({ queryKey: ["admin_tenant_users", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["admin_instances", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao excluir usuário: ${e?.message ?? "erro"}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const restoreUserInTenant = async (u: TenantUserRow) => {
    if (!activeTenantId) return;
    setDeletingUserId(u.user_id);
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("users_profile")
        .update({ deleted_at: null })
        .eq("tenant_id", activeTenantId)
        .eq("user_id", u.user_id);
      if (error) throw error;
      showSuccess("Acesso restaurado.");
      await qc.invalidateQueries({ queryKey: ["admin_tenant_users", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao restaurar usuário: ${e?.message ?? "erro"}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const addSelfToTenant = async () => {
    if (!activeTenantId || !user?.id) return;
    setAddingSelf(true);
    try {
      await ensureFreshTokenForRls();

      const roleKeys = (tenantRolesQ.data ?? []).map((r) => r.key);
      const chosenRole = roleKeys.includes(selfRole) ? selfRole : roleKeys[0] || "admin";

      const displayName =
        (user as any)?.user_metadata?.name ||
        (user as any)?.user_metadata?.full_name ||
        (user.email ? user.email.split("@")[0] : null);

      const { error } = await supabase
        .from("users_profile")
        .upsert(
          {
            user_id: user.id,
            tenant_id: activeTenantId,
            role: chosenRole,
            email: user.email ?? null,
            display_name: displayName ?? null,
            deleted_at: null,
          } as any,
          { onConflict: "user_id,tenant_id" }
        );

      if (error) throw error;

      showSuccess("Seu usuário foi adicionado ao tenant.");
      await qc.invalidateQueries({ queryKey: ["admin_tenant_users", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao adicionar seu usuário: ${e?.message ?? "erro"}`);
    } finally {
      setAddingSelf(false);
    }
  };

  // ---------------- Journeys (for WA routing) ----------------
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
      return opts as JourneyOpt[];
    },
  });

  // ---------------- WhatsApp instances ----------------
  const instancesQ = useQuery({
    queryKey: ["admin_instances", activeTenantId],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select(
          "id,name,status,zapi_instance_id,phone_number,webhook_secret,default_journey_id,assigned_user_id,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as WaInstanceRow[];
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

  const setInstanceAssignee = async (instanceId: string, userId: string | null) => {
    if (!activeTenantId) return;
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("wa_instances")
        .update({ assigned_user_id: userId })
        .eq("tenant_id", activeTenantId)
        .eq("id", instanceId);
      if (error) throw error;
      showSuccess("Usuário responsável atualizado.");
      await qc.invalidateQueries({ queryKey: ["admin_instances", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar usuário responsável: ${e?.message ?? "erro"}`);
    }
  };

  const setInstanceStatus = async (instanceId: string, status: "active" | "paused") => {
    if (!activeTenantId) return;
    setUpdatingInstanceId(instanceId);
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("wa_instances")
        .update({ status })
        .eq("tenant_id", activeTenantId)
        .eq("id", instanceId);
      if (error) throw error;
      showSuccess(status === "active" ? "Instância ativada." : "Instância inativada.");
      await qc.invalidateQueries({ queryKey: ["admin_instances", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar status: ${e?.message ?? "erro"}`);
    } finally {
      setUpdatingInstanceId(null);
    }
  };

  const deleteInstance = async (instanceId: string) => {
    if (!activeTenantId) return;
    setDeletingInstanceId(instanceId);
    try {
      await ensureFreshTokenForRls();
      const { error } = await supabase
        .from("wa_instances")
        .update({ deleted_at: new Date().toISOString(), status: "disabled" })
        .eq("tenant_id", activeTenantId)
        .eq("id", instanceId);
      if (error) throw error;
      showSuccess("Instância excluída.");
      await qc.invalidateQueries({ queryKey: ["admin_instances", activeTenantId] });
      if (monitorInstanceId === instanceId) setMonitorInstanceId("");
    } catch (e: any) {
      showError(`Falha ao excluir instância: ${e?.message ?? "erro"}`);
    } finally {
      setDeletingInstanceId(null);
    }
  };

  const [instName, setInstName] = useState("Principal");
  const [instPhone, setInstPhone] = useState("+55");
  const [instZapiId, setInstZapiId] = useState("");
  const [instToken, setInstToken] = useState("");
  const [instSecret, setInstSecret] = useState("");
  const [instJourneyId, setInstJourneyId] = useState<string>("");
  const [instAssignedUserId, setInstAssignedUserId] = useState<string>("");
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
        assigned_user_id: instAssignedUserId || null,
      });
      if (error) throw error;
      showSuccess("Instância cadastrada.");
      setInstZapiId("");
      setInstToken("");
      setInstSecret("");
      setInstJourneyId("");
      setInstAssignedUserId("");
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

  // ---------------- Monitor ----------------
  const [monitorInstanceId, setMonitorInstanceId] = useState<string>("");
  const MONITOR_PAGE_SIZE = 10;
  const [waMessagesPage, setWaMessagesPage] = useState(0);
  const [waInboxPage, setWaInboxPage] = useState(0);

  useEffect(() => {
    setWaMessagesPage(0);
    setWaInboxPage(0);
  }, [activeTenantId, monitorInstanceId]);

  const waRecentQ = useQuery({
    queryKey: ["admin_wa_recent", activeTenantId, monitorInstanceId, waMessagesPage],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("wa_messages")
        .select(
          "id,instance_id,direction,type,from_phone,to_phone,body_text,media_url,correlation_id,occurred_at,case_id",
          { count: "exact" }
        )
        .eq("tenant_id", activeTenantId!)
        .order("occurred_at", { ascending: false })
        .range(waMessagesPage * MONITOR_PAGE_SIZE, waMessagesPage * MONITOR_PAGE_SIZE + MONITOR_PAGE_SIZE - 1);

      if (monitorInstanceId) q = q.eq("instance_id", monitorInstanceId);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const waInboxQ = useQuery({
    queryKey: ["admin_wa_inbox", activeTenantId, monitorInstanceId, waInboxPage],
    enabled: Boolean(isSuperAdmin && activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("wa_webhook_inbox")
        .select("id,instance_id,ok,http_status,reason,wa_type,from_phone,to_phone,meta_json,received_at", {
          count: "exact",
        })
        .eq("tenant_id", activeTenantId!)
        .order("received_at", { ascending: false })
        .range(waInboxPage * MONITOR_PAGE_SIZE, waInboxPage * MONITOR_PAGE_SIZE + MONITOR_PAGE_SIZE - 1);

      if (monitorInstanceId) q = q.eq("instance_id", monitorInstanceId);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const caseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of waRecentQ.data?.rows ?? []) if ((m as any).case_id) ids.add(String((m as any).case_id));
    for (const it of waInboxQ.data?.rows ?? []) {
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
    const m = new Map<string, WaInstanceRow>();
    for (const it of instancesQ.data ?? []) m.set(it.id, it);
    return m;
  }, [instancesQ.data]);

  const userById = useMemo(() => {
    const m = new Map<string, { label: string; role: string }>();
    for (const u of userOptions) m.set(u.id, { label: u.label, role: u.role });
    return m;
  }, [userOptions]);

  return (
    <RequireAuth>
      <AppShell>
        <Dialog open={inviteLinkOpen} onOpenChange={setInviteLinkOpen}>
          <DialogContent className="rounded-[22px]">
            <DialogHeader>
              <DialogTitle>Primeiro acesso</DialogTitle>
              <DialogDescription>
                Você pode enviar um link de redefinição (recomendado) ou uma senha temporária.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label className="text-xs">Link de reset (recomendado)</Label>
                <div className="flex items-center gap-2">
                  <Input value={inviteLink} readOnly className="h-11 rounded-2xl bg-slate-50" />
                  <Button variant="secondary" className="h-11 rounded-2xl" onClick={copyInviteLink} disabled={!inviteLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                </div>
                <div className="text-[11px] text-slate-500">
                  O usuário abre o link e define a senha em <span className="font-medium">/auth/reset</span>.
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Senha temporária</Label>
                <div className="flex items-center gap-2">
                  <Input value={inviteTempPassword} readOnly className="h-11 rounded-2xl bg-slate-50 font-mono text-xs" />
                  <Button
                    variant="secondary"
                    className="h-11 rounded-2xl"
                    onClick={copyTempPassword}
                    disabled={!inviteTempPassword}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                </div>
                <div className="text-[11px] text-slate-500">
                  Se usar senha temporária, o usuário pode trocar depois via "Esqueci minha senha".
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                onClick={() => setInviteLinkOpen(false)}
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Admin</h2>
              <p className="mt-1 text-sm text-slate-600">Gestão do microsaas: tenants, usuários e integrações.</p>
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
                <TabsTrigger value="tenants" className="rounded-xl">
                  Tenants
                </TabsTrigger>
                <TabsTrigger value="journeys" className="rounded-xl">
                  Jornadas
                </TabsTrigger>
                <TabsTrigger value="prompts" className="rounded-xl">
                  Prompts
                </TabsTrigger>
                <TabsTrigger value="users" className="rounded-xl">
                  Usuários
                </TabsTrigger>
                <TabsTrigger value="access" className="rounded-xl">
                  Acessos
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="rounded-xl">
                  WhatsApp
                </TabsTrigger>
                <TabsTrigger value="branding" className="rounded-xl">
                  Branding
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tenants" className="mt-4">
                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Criar tenant</div>
                    <div className="mt-1 text-xs text-slate-500">Para o MVP, o super-admin pode criar tenants diretamente.</div>

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
                        <Input value={tenantSlug} readOnly className="mt-1 rounded-2xl bg-slate-50" />
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
                              softDeleted ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                              <div className="mt-0.5 truncate text-xs text-slate-500">/{t.slug}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {softDeleted ? (
                                <Badge className="rounded-full border-0 bg-rose-100 text-rose-900 hover:bg-rose-100">deletado</Badge>
                              ) : (
                                <Badge
                                  className={cn(
                                    "rounded-full border-0",
                                    t.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"
                                  )}
                                >
                                  {t.status}
                                </Badge>
                              )}
                              {softDeleted && (
                                <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => restoreTenant(t.id)}>
                                  Restaurar
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {(tenantsQ.data ?? []).length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">Nenhum tenant encontrado.</div>
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

              <TabsContent value="users" className="mt-4">
                {!activeTenantId ? (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Selecione um tenant (botão "Trocar") para gerenciar usuários.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                            <Shield className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Super-admins</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              Promove/remover super-admin por email (o usuário precisa existir no Auth).
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          className="h-10 rounded-2xl"
                          onClick={() => superAdminsQ.refetch()}
                          disabled={superAdminsQ.isFetching}
                        >
                          {superAdminsQ.isFetching ? "Atualizando…" : "Atualizar"}
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input
                            value={superAdminEmail}
                            onChange={(e) => setSuperAdminEmail(e.target.value)}
                            className="mt-1 h-11 rounded-2xl"
                            placeholder="email@empresa.com"
                          />
                          <div className="mt-1 text-[11px] text-slate-500">
                            Depois de promover, a pessoa deve fazer <span className="font-medium">logout/login</span>.
                          </div>
                        </div>
                        <Button
                          onClick={() => setSuperAdminByEmail(superAdminEmail, true)}
                          disabled={settingSuperAdmin || !superAdminEmail.trim()}
                          className="h-11 rounded-2xl bg-indigo-600 px-4 text-white hover:bg-indigo-700"
                        >
                          {settingSuperAdmin ? "Salvando…" : "Tornar super-admin"}
                        </Button>
                        <Button
                          onClick={() => setSuperAdminByEmail(superAdminEmail, false)}
                          disabled={settingSuperAdmin || !superAdminEmail.trim()}
                          variant="secondary"
                          className="h-11 rounded-2xl px-4"
                        >
                          Remover
                        </Button>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                        <div className="grid grid-cols-[1fr_120px_120px] gap-0 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                          <div>Email</div>
                          <div>Allowlist</div>
                          <div>Claim</div>
                        </div>
                        <div className="divide-y divide-slate-200 bg-white">
                          {(superAdminsQ.data ?? []).map((r: any) => (
                            <div key={r.email} className="grid grid-cols-[1fr_120px_120px] items-center gap-0 px-3 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">{r.email}</div>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {r.state === "not_found"
                                    ? "não cadastrado"
                                    : r.state === "allowlist_only"
                                      ? "allowlist (bootstrap)"
                                      : "super-admin (claim)"}
                                </div>
                              </div>
                              <div>
                                <Badge
                                  className={cn(
                                    "rounded-full border-0",
                                    r.allowlisted ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-500"
                                  )}
                                >
                                  {r.allowlisted ? "sim" : "não"}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <Badge
                                  className={cn(
                                    "rounded-full border-0",
                                    r.claimSuperAdmin ? "bg-indigo-100 text-indigo-900" : "bg-slate-100 text-slate-600"
                                  )}
                                >
                                  {r.claimSuperAdmin ? "ativo" : "—"}
                                </Badge>
                                {r.claimSuperAdmin && (
                                  <Button
                                    variant="secondary"
                                    className="h-8 rounded-2xl"
                                    onClick={() => setSuperAdminByEmail(r.email, false)}
                                    disabled={settingSuperAdmin}
                                  >
                                    Remover
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          {(superAdminsQ.data ?? []).length === 0 && (
                            <div className="px-3 py-4 text-xs text-slate-500">Nenhum super-admin encontrado.</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                        Observação: a promoção é protegida por allowlist (Secret <span className="font-medium">APP_SUPER_ADMIN_EMAILS</span>) para evitar escalonamento acidental.
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                            <UsersRound className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Convidar usuário</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">Cria acesso e define cargo/rotas para o tenant.</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_0.9fr_0.9fr_auto]">
                        <div>
                          <Label className="text-xs">Nome</Label>
                          <Input value={invName} onChange={(e) => setInvName(e.target.value)} className="mt-1 rounded-2xl" placeholder="Ex: João" />
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} className="mt-1 rounded-2xl" placeholder="joao@empresa.com" />
                        </div>
                        <div>
                          <Label className="text-xs">WhatsApp</Label>
                          <Input value={invPhone} onChange={(e) => setInvPhone(e.target.value)} className="mt-1 rounded-2xl" placeholder="+5511999999999" />
                        </div>
                        <div>
                          <Label className="text-xs">Cargo</Label>
                          <Select value={invRole} onValueChange={(v) => setInvRole(v as UserRole)}>
                            <SelectTrigger className="mt-1 h-10 rounded-2xl">
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                              {(tenantRolesQ.data ?? ([
                                { key: "admin", name: "Admin" },
                                { key: "manager", name: "Gerente" },
                                { key: "supervisor", name: "Supervisor" },
                                { key: "leader", name: "Líder" },
                                { key: "vendor", name: "Vendedor" },
                              ] as any)).map((r: any) => (
                                <SelectItem key={r.key} value={r.key} className="rounded-xl">
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            onClick={inviteUser}
                            disabled={inviting || !invEmail.trim()}
                            className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-4 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                          >
                            {inviting ? "Enviando…" : "Convidar"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                        O convite vai por email do Supabase. O usuário entra e já cai com permissão no tenant.
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">Usuários do tenant</div>
                        <div className="text-xs text-slate-500">{usersQ.data?.length ?? 0}</div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {(usersQ.data ?? []).map((u) => {
                          const isDeleted = Boolean(u.deleted_at);
                          return (
                            <div
                              key={u.user_id}
                              className={cn(
                                "rounded-2xl border p-3",
                                isDeleted ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"
                              )}
                            >
                              <div className="grid gap-2 lg:grid-cols-[1.1fr_1fr_0.8fr_0.6fr_auto]">
                                <div>
                                  <Label className="text-[11px]">Nome</Label>
                                  <Input
                                    defaultValue={u.display_name ?? ""}
                                    className={cn("mt-1 h-10 rounded-2xl", isDeleted ? "bg-white" : "bg-white")}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim() || null;
                                      if (v === (u.display_name ?? null)) return;
                                      updateUserProfile(u, { display_name: v } as any);
                                    }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[11px]">Email</Label>
                                  <Input
                                    defaultValue={u.email ?? ""}
                                    className={cn("mt-1 h-10 rounded-2xl", isDeleted ? "bg-white" : "bg-white")}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim().toLowerCase() || null;
                                      if (v === (u.email ?? null)) return;
                                      updateUserProfile(u, { email: v } as any);
                                    }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[11px]">WhatsApp</Label>
                                  <Input
                                    defaultValue={u.phone_e164 ?? ""}
                                    className={cn("mt-1 h-10 rounded-2xl", isDeleted ? "bg-white" : "bg-white")}
                                    onBlur={(e) => {
                                      const v = normalizePhoneLoose(e.target.value);
                                      const next = v || null;
                                      if (next === (u.phone_e164 ?? null)) return;
                                      updateUserProfile(u, { phone_e164: next } as any);
                                    }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[11px]">Cargo</Label>
                                  <Select
                                    value={u.role}
                                    onValueChange={(v) => {
                                      if (v === u.role) return;
                                      updateUserProfile(u, { role: v as any } as any);
                                    }}
                                  >
                                    <SelectTrigger className={cn("mt-1 h-10 rounded-2xl", isDeleted ? "bg-white" : "bg-white")}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl">
                                      {(tenantRolesQ.data ?? ([
                                        { key: "admin", name: "Admin" },
                                        { key: "manager", name: "Gerente" },
                                        { key: "supervisor", name: "Supervisor" },
                                        { key: "leader", name: "Líder" },
                                        { key: "vendor", name: "Vendedor" },
                                      ] as any)).map((r: any) => (
                                        <SelectItem key={r.key} value={r.key} className="rounded-xl">
                                          {r.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end justify-end gap-2">
                                  {isDeleted ? (
                                    <Button
                                      variant="secondary"
                                      className="h-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-emerald-900 hover:bg-emerald-100"
                                      disabled={deletingUserId === u.user_id}
                                      onClick={() => restoreUserInTenant(u)}
                                      title="Restaurar acesso"
                                    >
                                      Restaurar
                                    </Button>
                                  ) : (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="secondary"
                                          className="h-10 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-rose-800 shadow-sm hover:bg-rose-100 hover:text-rose-900"
                                          disabled={deletingUserId === u.user_id}
                                          title="Excluir usuário do tenant"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent className="rounded-[22px]">
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir usuário deste tenant?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Isso remove o acesso do usuário ao tenant (soft delete). Não apaga a conta do Supabase Auth.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
                                            onClick={() => removeUserFromTenant(u)}
                                          >
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}

                                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                                    id: <span className="font-medium text-slate-900">{u.user_id.slice(0, 8)}…</span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                                  {roleLabel(u.role)}
                                </Badge>
                                {isDeleted ? (
                                  <Badge className="rounded-full border-0 bg-rose-100 text-rose-900 hover:bg-rose-100">
                                    removido
                                  </Badge>
                                ) : null}
                                <span>criado em {fmtTs(u.created_at)}</span>
                              </div>
                            </div>
                          );
                        })}

                        {(usersQ.data ?? []).length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                            Nenhum usuário cadastrado para este tenant.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                            <Copy className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Convites recentes</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">Inclui links manuais quando o email falha.</div>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          className="h-10 rounded-2xl"
                          onClick={() => invitesQ.refetch()}
                          disabled={invitesQ.isFetching}
                        >
                          {invitesQ.isFetching ? "Atualizando…" : "Atualizar"}
                        </Button>
                      </div>

                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                        <div className="grid grid-cols-[1fr_120px_auto] gap-0 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                          <div>Email</div>
                          <div>Tipo</div>
                          <div className="text-right">Ações</div>
                        </div>
                        <div className="divide-y divide-slate-200 bg-white">
                          {(invitesQ.data ?? []).map((it: any) => {
                            const link = String(it.invite_link ?? "");
                            const manual = Boolean(link);
                            return (
                              <div key={it.id} className="grid grid-cols-[1fr_120px_auto] items-center gap-0 px-3 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-900">{it.email}</div>
                                  <div className="mt-0.5 text-[11px] text-slate-500">
                                    {new Date(it.created_at).toLocaleString()}
                                  </div>
                                </div>
                                <div>
                                  <Badge
                                    className={cn(
                                      "rounded-full border-0",
                                      manual ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                                    )}
                                  >
                                    {manual ? "manual" : "email"}
                                  </Badge>
                                </div>
                                <div className="flex justify-end gap-2">
                                  {manual ? (
                                    <Button
                                      variant="secondary"
                                      className="h-9 rounded-2xl"
                                      onClick={() => openInviteLink(link)}
                                    >
                                      Ver link
                                    </Button>
                                  ) : (
                                    <div className="text-[11px] text-slate-500">—</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {(invitesQ.data ?? []).length === 0 && (
                            <div className="px-3 py-4 text-xs text-slate-500">Nenhum convite registrado ainda.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="access" className="mt-4">
                <AccessMatrixPanel />
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
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Smartphone className="h-4 w-4 text-slate-500" /> Cadastrar instância
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          A instância fica atrelada à jornada (roteamento inbound) e pode ser atribuída a um usuário do painel.
                        </div>

                        <div className="mt-4 grid gap-3">
                          <div>
                            <Label className="text-xs">Nome</Label>
                            <Input value={instName} onChange={(e) => setInstName(e.target.value)} className="mt-1 rounded-2xl" />
                          </div>
                          <div>
                            <Label className="text-xs">Phone number (opcional)</Label>
                            <Input value={instPhone} onChange={(e) => setInstPhone(e.target.value)} className="mt-1 rounded-2xl" placeholder="+5511888888888" />
                          </div>
                          <div>
                            <Label className="text-xs">Z-API instance id</Label>
                            <Input value={instZapiId} onChange={(e) => setInstZapiId(e.target.value)} className="mt-1 rounded-2xl" placeholder="abc123" />
                          </div>
                          <div>
                            <Label className="text-xs">Z-API token</Label>
                            <Input value={instToken} onChange={(e) => setInstToken(e.target.value)} className="mt-1 rounded-2xl" placeholder="token" />
                          </div>
                          <div>
                            <Label className="text-xs">Webhook secret</Label>
                            <Input value={instSecret} onChange={(e) => setInstSecret(e.target.value)} className="mt-1 rounded-2xl" placeholder="secreto (ou deixe vazio para gerar)" />
                          </div>

                          <div className="grid gap-3 lg:grid-cols-2">
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
                              <div className="mt-1 text-[11px] text-slate-500">Define em qual fluxo cada conversa/caso será criado.</div>
                            </div>

                            <div>
                              <Label className="text-xs">Usuário responsável (painel)</Label>
                              <select
                                value={instAssignedUserId}
                                onChange={(e) => setInstAssignedUserId(e.target.value)}
                                className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-[hsl(var(--byfrost-accent)/0.45)] outline-none"
                              >
                                <option value="">(sem atribuição)</option>
                                {userOptions.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.label} • {roleLabel(u.role as any)}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-1 text-[11px] text-slate-500">Ao enviar mensagens pelo painel, essa instância será priorizada para o usuário.</div>
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

                        <div className="mt-3">
                          <Accordion type="multiple" defaultValue={[]} className="space-y-2">
                            {(instancesQ.data ?? []).map((i) => {
                              const pathUrl = `https://pryoirzeghatrgecwrci.supabase.co/functions/v1/webhooks-zapi-inbound/${encodeURIComponent(
                                i.zapi_instance_id ?? ""
                              )}/${encodeURIComponent(i.webhook_secret)}`;
                              const inboundUrl = `${pathUrl}?dir=inbound`;
                              const outboundUrl = `${pathUrl}?dir=outbound`;
                              const isActive = i.status === "active";
                              const isPaused = i.status === "paused";
                              const isDisabled = i.status === "disabled";
                              const assignee = i.assigned_user_id ? userById.get(i.assigned_user_id) : null;

                              return (
                                <AccordionItem key={i.id} value={i.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3">
                                  <AccordionTrigger className="py-3 hover:no-underline">
                                    <div className="flex w-full items-start justify-between gap-3 pr-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-slate-900">{i.name}</div>
                                        <div className="mt-0.5 truncate text-xs text-slate-500">zapi_instance_id: {i.zapi_instance_id}</div>
                                        <div className="mt-0.5 truncate text-[11px] text-slate-500">
                                          responsável: <span className="font-medium text-slate-700">{assignee?.label ?? "(não definido)"}</span>
                                        </div>
                                      </div>
                                      <Badge
                                        className={cn(
                                          "mt-0.5 rounded-full border-0",
                                          isActive ? "bg-emerald-100 text-emerald-900" : isPaused ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"
                                        )}
                                      >
                                        {isActive ? "ativo" : isPaused ? "inativo" : i.status}
                                      </Badge>
                                    </div>
                                  </AccordionTrigger>

                                  <AccordionContent className="pb-3">
                                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/70 p-2">
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-semibold text-slate-700">webhook_secret</div>
                                        <div className="mt-0.5 truncate text-[11px] text-slate-600">{i.webhook_secret}</div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {!isDisabled && (
                                          <Button
                                            variant="secondary"
                                            className={cn(
                                              "h-9 rounded-2xl px-3 shadow-sm",
                                              isActive
                                                ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                                : "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                                            )}
                                            disabled={Boolean(updatingInstanceId) || deletingInstanceId === i.id}
                                            onClick={() => setInstanceStatus(i.id, isActive ? "paused" : "active")}
                                            title={isActive ? "Inativar instância" : "Ativar instância"}
                                          >
                                            {isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                                          </Button>
                                        )}

                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="secondary"
                                              className="h-9 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-rose-800 shadow-sm hover:bg-rose-100 hover:text-rose-900"
                                              disabled={deletingInstanceId === i.id || Boolean(updatingInstanceId)}
                                              title="Excluir instância"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent className="rounded-[22px]">
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Excluir instância?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Isso vai remover a instância do painel (soft delete). As mensagens já registradas serão mantidas.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                              <AlertDialogAction
                                                className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
                                                onClick={() => deleteInstance(i.id)}
                                              >
                                                Excluir
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </div>

                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-2">
                                        <div className="text-[11px] font-semibold text-slate-700">Z-API: Ao receber</div>
                                        <div className="mt-1 rounded-xl bg-slate-50 px-2 py-1 text-[11px] text-slate-700 break-all">{inboundUrl}</div>
                                        <div className="mt-1 text-[11px] text-slate-500">
                                          Garante que o evento seja tratado como <span className="font-medium">inbound</span>.
                                        </div>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-2">
                                        <div className="text-[11px] font-semibold text-slate-700">Z-API: Ao enviar</div>
                                        <div className="mt-1 rounded-xl bg-slate-50 px-2 py-1 text-[11px] text-slate-700 break-all">{outboundUrl}</div>
                                        <div className="mt-1 text-[11px] text-slate-500">
                                          Garante que o evento seja tratado como <span className="font-medium">outbound</span>.
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-2">
                                        <div className="text-[11px] font-semibold text-slate-700">Roteamento inbound</div>
                                        <select
                                          value={i.default_journey_id ?? ""}
                                          onChange={(e) => setInstanceJourney(i.id, e.target.value ? e.target.value : null)}
                                          className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                                        >
                                          <option value="">(fallback)</option>
                                          {(tenantJourneysQ.data ?? []).map((j) => (
                                            <option key={j.id} value={j.id}>
                                              {j.name}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="mt-1 text-[11px] text-slate-500">Define em qual jornada cada conversa/caso será criado.</div>
                                      </div>

                                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-2">
                                        <div className="text-[11px] font-semibold text-slate-700">Usuário responsável</div>
                                        <select
                                          value={i.assigned_user_id ?? ""}
                                          onChange={(e) => setInstanceAssignee(i.id, e.target.value ? e.target.value : null)}
                                          className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                                        >
                                          <option value="">(sem atribuição)</option>
                                          {userOptions.map((u) => (
                                            <option key={u.id} value={u.id}>
                                              {u.label} • {roleLabel(u.role as any)}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="mt-1 text-[11px] text-slate-500">Usado como prioridade na hora de enviar mensagens via painel.</div>
                                      </div>
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>

                          {(instancesQ.data ?? []).length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">Nenhuma instância cadastrada.</div>
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
                              onChange={(e) => {
                                setMonitorInstanceId(e.target.value);
                                setWaMessagesPage(0);
                                setWaInboxPage(0);
                              }}
                              className="mt-1 h-9 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                            >
                              <option value="">(todas)</option>
                              {(instancesQ.data ?? []).map((i) => (
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
                              setWaMessagesPage(0);
                              setWaInboxPage(0);
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
                          <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">wa_messages (armazenamento)</div>
                          <div className="grid grid-cols-[140px_96px_110px_1fr] gap-0 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold text-slate-600">
                            <div>Quando</div>
                            <div>Direção</div>
                            <div>Tipo</div>
                            <div>Resumo</div>
                          </div>

                          <div className="divide-y divide-slate-200 bg-white">
                            {(waRecentQ.data?.rows ?? []).map((m: any) => {
                              const inst = instanceById.get(m.instance_id);
                              const summary =
                                m.type === "image"
                                  ? m.media_url
                                    ? `Imagem: ${m.media_url}`
                                    : "Imagem"
                                  : m.type === "location"
                                    ? "Localização"
                                    : m.body_text ?? "(sem texto)";

                              const c = m.case_id ? casesLookupQ.data?.get(String(m.case_id)) : null;
                              const j = (c as any)?.journeys;

                              return (
                                <div key={m.id} className="grid grid-cols-[140px_96px_110px_1fr] items-start gap-0 px-3 py-2">
                                  <div className="text-[11px] text-slate-600">
                                    <div className="font-medium text-slate-900">{fmtTs(m.occurred_at)}</div>
                                    <div className="mt-0.5 text-slate-500 truncate">{inst?.name ?? "—"}</div>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge
                                      className={cn(
                                        "rounded-full border-0",
                                        m.direction === "inbound" ? "bg-indigo-100 text-indigo-900" : "bg-emerald-100 text-emerald-900"
                                      )}
                                    >
                                      {m.direction}
                                    </Badge>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">{m.type}</Badge>
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
                              <div className="px-3 py-3 text-sm text-rose-700">Erro ao carregar wa_messages: {(waRecentQ.error as any)?.message ?? ""}</div>
                            )}

                            {(waRecentQ.data?.rows ?? []).length === 0 && !waRecentQ.isError && (
                              <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum evento ainda.</div>
                            )}
                          </div>

                          <div className="p-3">
                            <PaginationControls page={waMessagesPage} pageSize={MONITOR_PAGE_SIZE} count={waRecentQ.data?.count ?? 0} onPage={setWaMessagesPage} />
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-[18px] border border-slate-200">
                          <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">wa_webhook_inbox (diagnóstico do roteamento)</div>
                          <div className="grid grid-cols-[120px_70px_90px_1fr] gap-0 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold text-slate-600">
                            <div>Quando</div>
                            <div>OK</div>
                            <div>Tipo</div>
                            <div>Roteamento</div>
                          </div>

                          <div className="divide-y divide-slate-200 bg-white">
                            {(waInboxQ.data?.rows ?? []).map((it: any) => {
                              const cid = it?.meta_json?.case_id ? String(it.meta_json.case_id) : "";
                              const c = cid ? casesLookupQ.data?.get(cid) : null;
                              const j = (c as any)?.journeys;
                              const reason = it.reason ? String(it.reason) : "";

                              return (
                                <div key={it.id} className="grid grid-cols-[120px_70px_90px_1fr] items-start gap-0 px-3 py-2">
                                  <div className="text-[11px] text-slate-600">
                                    <div className="font-medium text-slate-900">{fmtTs(it.received_at)}</div>
                                    <div className="mt-0.5 text-slate-500 truncate">{it.http_status ?? ""}</div>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge className={cn("rounded-full border-0", it.ok ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900")}>
                                      {it.ok ? "ok" : "fail"}
                                    </Badge>
                                  </div>

                                  <div className="pt-0.5">
                                    <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">{it.wa_type ?? "—"}</Badge>
                                  </div>

                                  <div className="min-w-0">
                                    <div className="text-xs text-slate-900 truncate">
                                      {cid ? `case ${cid.slice(0, 8)}…` : "sem case"}
                                      {j?.key ? ` • ${j.key}` : ""}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500 truncate">{reason ? `motivo: ${reason}` : ""}</div>
                                  </div>
                                </div>
                              );
                            })}

                            {waInboxQ.isError && (
                              <div className="px-3 py-3 text-sm text-rose-700">Erro ao carregar wa_webhook_inbox: {(waInboxQ.error as any)?.message ?? ""}</div>
                            )}

                            {(waInboxQ.data?.rows ?? []).length === 0 && !waInboxQ.isError && (
                              <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum diagnóstico ainda.</div>
                            )}
                          </div>

                          <div className="p-3">
                            <PaginationControls page={waInboxPage} pageSize={MONITOR_PAGE_SIZE} count={waInboxQ.data?.count ?? 0} onPage={setWaInboxPage} />
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