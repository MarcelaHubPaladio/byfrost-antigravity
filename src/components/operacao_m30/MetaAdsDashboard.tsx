import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { BarChart3, TrendingUp, Users, DollarSign, MousePointerClick } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetaAdsDashboard() {
  const { activeTenantId } = useTenant();

  const metricsQ = useQuery({
    queryKey: ["meta_ads_metrics_dashboard", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // Get all accounts
      const { data: accounts, error: accErr } = await supabase
        .from("meta_ads_accounts")
        .select("id, name")
        .eq("tenant_id", activeTenantId!);
      if (accErr) throw accErr;
      
      if (!accounts || accounts.length === 0) return { accounts: [], metrics: [] };

      // Get all campaigns for these accounts
      const accIds = accounts.map(a => a.id);
      const { data: campaigns, error: campErr } = await supabase
        .from("meta_ads_campaigns")
        .select("id, meta_ads_account_id, name")
        .in("meta_ads_account_id", accIds);
      if (campErr) throw campErr;

      if (!campaigns || campaigns.length === 0) return { accounts, metrics: [] };

      // Get last 7 days metrics
      const campIds = campaigns.map(c => c.id);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: metrics, error: metErr } = await supabase
        .from("meta_ads_metrics_daily")
        .select("*")
        .in("campaign_id", campIds)
        .gte("date", sevenDaysAgo.toISOString().split("T")[0]);
      if (metErr) throw metErr;

      return { accounts, campaigns, metrics: metrics || [] };
    }
  });

  if (metricsQ.isLoading) {
    return <div className="p-8 text-center text-slate-500">Carregando métricas...</div>;
  }

  if (metricsQ.isError) {
    return <div className="p-8 text-center text-rose-500">Erro ao carregar métricas.</div>;
  }

  const { accounts, campaigns, metrics } = metricsQ.data || { accounts: [], campaigns: [], metrics: [] };

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[40px] border-2 border-dashed border-slate-200 bg-white/50 py-20 text-center">
        <BarChart3 className="mb-4 h-12 w-12 text-slate-300" />
        <h3 className="text-lg font-bold text-slate-500">Nenhuma conta de anúncios conectada</h3>
        <p className="max-w-md text-sm text-slate-500 mt-2">
          Vá em Configurações &gt; Integrações &gt; Meta Ads para conectar suas contas e ver o dashboard.
        </p>
      </div>
    );
  }

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalLeads = 0;
  let totalPurchases = 0;

  metrics.forEach(m => {
    totalSpend += Number(m.spend || 0);
    totalImpressions += Number(m.impressions || 0);
    totalClicks += Number(m.clicks || 0);
    totalLeads += Number(m.leads || 0);
    totalPurchases += Number(m.purchases || 0);
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Investimento (7d)</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totalSpend.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Impressões (7d)</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalImpressions.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Cliques (7d)</CardTitle>
            <MousePointerClick className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClicks.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Leads (7d)</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Compras (7d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPurchases.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Desempenho por Campanha</h3>
        {campaigns.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhuma campanha importada nos últimos 7 dias.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Campanha</th>
                  <th className="py-3 px-4 text-right">Investimento</th>
                  <th className="py-3 px-4 text-right">Impressões</th>
                  <th className="py-3 px-4 text-right">Cliques</th>
                  <th className="py-3 px-4 text-right">Leads</th>
                  <th className="py-3 px-4 text-right">Compras</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((camp: any) => {
                  const campMetrics = metrics.filter((m: any) => m.campaign_id === camp.id);
                  const spend = campMetrics.reduce((acc: number, m: any) => acc + Number(m.spend || 0), 0);
                  const impressions = campMetrics.reduce((acc: number, m: any) => acc + Number(m.impressions || 0), 0);
                  const clicks = campMetrics.reduce((acc: number, m: any) => acc + Number(m.clicks || 0), 0);
                  const leads = campMetrics.reduce((acc: number, m: any) => acc + Number(m.leads || 0), 0);
                  const purchases = campMetrics.reduce((acc: number, m: any) => acc + Number(m.purchases || 0), 0);

                  if (spend === 0 && impressions === 0) return null;

                  return (
                    <tr key={camp.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-medium text-slate-800">{camp.name}</td>
                      <td className="py-3 px-4 text-right">R$ {spend.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right">{impressions.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">{clicks.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">{leads.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">{purchases.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
