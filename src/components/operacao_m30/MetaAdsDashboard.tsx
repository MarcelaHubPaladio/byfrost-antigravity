import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { BarChart3, TrendingUp, Users, DollarSign, MousePointerClick } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetaAdsDashboard({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { activeTenantId } = useTenant();

  const metricsQ = useQuery({
    queryKey: ["meta_ads_metrics_dashboard", activeTenantId, startDate, endDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // Get all accounts
      const { data: accounts, error: accErr } = await supabase
        .from("meta_ads_accounts")
        .select("id, name")
        .eq("tenant_id", activeTenantId!);
      if (accErr) throw accErr;
      
      if (!accounts || accounts.length === 0) return { accounts: [], campaigns: [], ads: [], metrics: [] };

      // Get all campaigns for these accounts
      const accIds = accounts.map(a => a.id);
      const { data: campaigns, error: campErr } = await supabase
        .from("meta_ads_campaigns")
        .select("id, meta_ads_account_id, name")
        .in("meta_ads_account_id", accIds);
      if (campErr) throw campErr;

      if (!campaigns || campaigns.length === 0) return { accounts, campaigns: [], ads: [], metrics: [] };

      const campIds = campaigns.map(c => c.id);

      // Get all ads for these campaigns
      const { data: ads, error: adsErr } = await supabase
        .from("meta_ads_ads")
        .select("id, meta_ads_campaign_id, name")
        .in("meta_ads_campaign_id", campIds);
      
      let q = supabase
        .from("meta_ads_metrics_daily")
        .select("*")
        .in("campaign_id", campIds);

      if (startDate) {
        q = q.gte("date", startDate.split("T")[0]);
      } else {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 30);
        q = q.gte("date", defaultDate.toISOString().split("T")[0]);
      }

      if (endDate) {
        q = q.lte("date", endDate.split("T")[0]);
      }

      const { data: metrics, error: metErr } = await q;
      if (metErr) throw metErr;

      return { accounts, campaigns, ads: ads || [], metrics: metrics || [] };
    }
  });

  if (metricsQ.isLoading) {
    return <div className="p-8 text-center text-slate-500">Carregando métricas...</div>;
  }

  if (metricsQ.isError) {
    return <div className="p-8 text-center text-rose-500">Erro ao carregar métricas.</div>;
  }

  const { accounts, campaigns, ads, metrics } = metricsQ.data || { accounts: [], campaigns: [], ads: [], metrics: [] };

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
            <CardTitle className="text-sm font-medium text-slate-600">Investimento</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totalSpend.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Impressões</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalImpressions.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Cliques</CardTitle>
            <MousePointerClick className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClicks.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Leads</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Compras</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPurchases.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Desempenho por Postagem/Anúncio</h3>
        {ads.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhum anúncio importado no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Anúncio</th>
                  <th className="py-3 px-4 text-slate-400">Campanha</th>
                  <th className="py-3 px-4 text-right">Investimento</th>
                  <th className="py-3 px-4 text-right">Impressões</th>
                  <th className="py-3 px-4 text-right">Cliques</th>
                  <th className="py-3 px-4 text-right">Leads</th>
                  <th className="py-3 px-4 text-right">Compras</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ads.map((ad: any) => {
                  const adMetrics = metrics.filter((m: any) => m.meta_ads_ad_id === ad.id);
                  const spend = adMetrics.reduce((acc: number, m: any) => acc + Number(m.spend || 0), 0);
                  const impressions = adMetrics.reduce((acc: number, m: any) => acc + Number(m.impressions || 0), 0);
                  const clicks = adMetrics.reduce((acc: number, m: any) => acc + Number(m.clicks || 0), 0);
                  const leads = adMetrics.reduce((acc: number, m: any) => acc + Number(m.leads || 0), 0);
                  const purchases = adMetrics.reduce((acc: number, m: any) => acc + Number(m.purchases || 0), 0);

                  if (spend === 0 && impressions === 0) return null;

                  const parentCampaign = campaigns.find((c: any) => c.id === ad.meta_ads_campaign_id);

                  return (
                    <tr key={ad.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-medium text-slate-800">{ad.name}</td>
                      <td className="py-3 px-4 text-slate-400 text-xs">{parentCampaign?.name}</td>
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
