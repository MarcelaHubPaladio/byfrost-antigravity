import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, User, CreditCard, Calendar, ArrowRight, Package } from "lucide-react";
import { NewClientDialog } from "@/components/clientes_sawe/NewClientDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ClientesSawe() {
  const { activeTenantId } = useTenant();
  const [q, setQ] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);

  const { data: journey } = useQuery({
    queryKey: ["journey_sawe", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id")
        .eq("key", "clientes_sawe")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases_sawe", activeTenantId, journey?.id],
    enabled: !!activeTenantId && !!journey?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(`
          id,
          title,
          state,
          created_at,
          fields:case_fields(key, value_text)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", journey!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredCases = cases?.filter((c) => {
    const search = q.toLowerCase();
    const title = c.title?.toLowerCase() || "";
    const email = c.fields.find(f => f.key === "email")?.value_text?.toLowerCase() || "";
    const cpf = c.fields.find(f => f.key === "cpf")?.value_text || "";
    return title.includes(search) || email.includes(search) || cpf.includes(search);
  });

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-8 space-y-8 bg-[#F8FAFC] min-h-screen">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">JORNADA SAWE</h1>
              <p className="text-slate-500 font-medium mt-1">Gestão de clientes e assinaturas SAWE</p>
            </div>
            <Button
              onClick={() => setNewClientOpen(true)}
              className="h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black px-6 shadow-lg shadow-blue-600/20"
            >
              <Plus className="mr-2 h-5 w-5" />
              NOVO CLIENTE
            </Button>
          </div>

          {/* Stats & Search */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Buscar por nome, e-mail ou CPF..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-14 pl-12 rounded-[24px] bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-blue-500/20 transition-all text-base font-medium"
              />
            </div>
            <div className="bg-white rounded-[24px] p-4 border border-slate-200 flex items-center justify-center gap-4 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <User className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Clientes</p>
                <p className="text-xl font-black text-slate-900 leading-none">{cases?.length || 0}</p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="w-[300px] h-14 font-black text-[10px] uppercase tracking-widest text-slate-400 px-8">Cliente</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Contato</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Pagamento</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Vencimento</TableHead>
                  <TableHead className="text-right px-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Carregando clientes...</TableCell>
                  </TableRow>
                ) : filteredCases?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 font-bold uppercase tracking-widest">Nenhum cliente encontrado</TableCell>
                  </TableRow>
                ) : (
                  filteredCases?.map((c) => {
                    const get = (key: string) => c.fields.find(f => f.key === key)?.value_text;
                    return (
                      <TableRow key={c.id} className="hover:bg-slate-50/50 border-slate-100 group transition-colors">
                        <TableCell className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                              {c.title?.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 leading-none mb-1">{c.title?.toUpperCase()}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">CPF: {get("cpf") || "---"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-700">{get("email") || "Sem e-mail"}</p>
                            <p className="text-[10px] font-medium text-slate-400">{get("whatsapp") || "Sem WhatsApp"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-3.5 w-3.5 text-slate-300" />
                            <Badge variant="outline" className="rounded-lg border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase">
                              {get("payment_method")?.replace("_", " ") || "---"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-slate-300" />
                            <span className="text-xs font-bold text-slate-700">Dia {get("due_date") || "--"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-8 text-right">
                          <Link to={`/app/clientes-sawe/${c.id}`}>
                            <Button variant="ghost" size="sm" className="h-10 rounded-xl hover:bg-blue-50 hover:text-blue-600 font-bold group-hover:translate-x-1 transition-all">
                              GERENCIAR
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <NewClientDialog 
          open={newClientOpen} 
          onOpenChange={setNewClientOpen}
          onSuccess={(id) => {
             // Optional: redirect to detail
             // nav(`/app/clientes-sawe/${id}`);
          }}
        />
      </AppShell>
    </RequireAuth>
  );
}
