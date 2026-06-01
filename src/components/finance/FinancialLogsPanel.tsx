import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function FinancialLogsPanel() {
  const { activeTenantId } = useTenant();

  const logsQ = useQuery({
    queryKey: ["financial_logs", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_logs")
        .select(`
          id,
          action_type,
          description,
          metadata,
          created_at,
          created_by
        `)
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Fetch users
      const userIds = Array.from(new Set(data.filter(d => d.created_by).map(d => d.created_by)));
      let usersMap = new Map();
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users_profile")
          .select("user_id, display_name")
          .in("user_id", userIds);
        usersMap = new Map((usersData || []).map(u => [u.user_id, u.display_name]));
      }

      return data.map(d => ({
        ...d,
        user_name: usersMap.get(d.created_by) || "Sistema",
      }));
    },
  });

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Auditoria (Logs)</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Registro de ações automáticas e manuais do módulo financeiro.
          </div>
        </div>
        <Button variant="outline" className="h-9 rounded-2xl" onClick={() => logsQ.refetch()}>
          Atualizar
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário/Sistema</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Descrição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logsQ.data ?? []).map((log: any) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.created_at)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{log.user_name}</TableCell>
                <TableCell className="whitespace-nowrap text-xs font-medium">{log.action_type}</TableCell>
                <TableCell className="min-w-[300px] text-xs">
                  <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{log.description}</div>
                </TableCell>
              </TableRow>
            ))}

            {!logsQ.isLoading && !(logsQ.data ?? []).length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-xs text-slate-600 dark:text-slate-400">
                  Nenhum log registrado ainda.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
