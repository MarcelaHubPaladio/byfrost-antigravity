import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Heart, MessageCircle, Share2, Instagram, Facebook, LayoutTemplate } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetaOrganicDashboard({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { activeTenantId } = useTenant();

  const metricsQ = useQuery({
    queryKey: ["meta_organic_metrics_dashboard", activeTenantId, startDate, endDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // 1. Get Pages
      const { data: pages, error: pageErr } = await supabase
        .from("meta_organic_pages")
        .select("id, name, platform")
        .eq("tenant_id", activeTenantId!);
      if (pageErr) throw pageErr;

      if (!pages || pages.length === 0) return { pages: [], posts: [], metrics: [] };

      const pageIds = pages.map(p => p.id);

      // 2. Get Posts filtered by Date
      let q = supabase
        .from("meta_organic_posts")
        .select("id, meta_organic_page_id, post_id, message, picture_url, permalink, posted_at")
        .in("meta_organic_page_id", pageIds)
        .order("posted_at", { ascending: false });

      if (startDate) {
        q = q.gte("posted_at", startDate);
      } else {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 30);
        q = q.gte("posted_at", defaultDate.toISOString());
      }

      if (endDate) {
        q = q.lte("posted_at", endDate);
      }

      const { data: posts, error: postErr } = await q;
      if (postErr) throw postErr;

      if (!posts || posts.length === 0) return { pages, posts: [], metrics: [] };

      const postIds = posts.map(p => p.id);

      // 3. Get Metrics for these posts
      const { data: metrics, error: metErr } = await supabase
        .from("meta_organic_metrics")
        .select("*")
        .in("meta_organic_post_id", postIds);
      
      if (metErr) throw metErr;

      return { pages, posts, metrics: metrics || [] };
    }
  });

  if (metricsQ.isLoading) {
    return <div className="p-8 text-center text-slate-500">Carregando métricas orgânicas...</div>;
  }

  if (metricsQ.isError) {
    return <div className="p-8 text-center text-rose-500">Erro ao carregar métricas orgânicas.</div>;
  }

  const { pages, posts, metrics } = metricsQ.data || { pages: [], posts: [], metrics: [] };

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[40px] border-2 border-dashed border-slate-200 bg-white/50 py-20 text-center">
        <LayoutTemplate className="mb-4 h-12 w-12 text-slate-300" />
        <h3 className="text-lg font-bold text-slate-500">Nenhuma página orgânica encontrada</h3>
        <p className="max-w-md text-sm text-slate-500 mt-2">
          As páginas são importadas automaticamente se o Token do Sistema tiver acesso a elas.
        </p>
      </div>
    );
  }

  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;

  metrics.forEach(m => {
    totalLikes += Number(m.likes || 0);
    totalComments += Number(m.comments || 0);
    totalShares += Number(m.shares || 0);
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Curtidas Totais</CardTitle>
            <Heart className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLikes.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Comentários</CardTitle>
            <MessageCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalComments.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Compartilhamentos</CardTitle>
            <Share2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalShares.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Postagens (Feed Orgânico)</h3>
        {posts.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhuma postagem importada no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="py-3 px-4 w-16">Mídia</th>
                  <th className="py-3 px-4">Postagem</th>
                  <th className="py-3 px-4">Página/Rede</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Curtidas</th>
                  <th className="py-3 px-4 text-right">Comentários</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map((post: any) => {
                  const postMetric = metrics.find((m: any) => m.meta_organic_post_id === post.id);
                  const parentPage = pages.find((p: any) => p.id === post.meta_organic_page_id);
                  
                  const likes = postMetric?.likes || 0;
                  const comments = postMetric?.comments || 0;
                  const dateStr = post.posted_at ? new Date(post.posted_at).toLocaleDateString("pt-BR") : "-";

                  return (
                    <tr key={post.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        {post.picture_url ? (
                          <a href={post.permalink} target="_blank" rel="noreferrer">
                            <img src={post.picture_url} alt="thumbnail" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                          </a>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                            <LayoutTemplate className="w-4 h-4 text-slate-300" />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate">
                        <a href={post.permalink} target="_blank" rel="noreferrer" className="hover:underline">
                          {post.message || "Sem legenda"}
                        </a>
                      </td>
                      <td className="py-3 px-4 text-slate-500 flex items-center gap-2">
                        {parentPage?.platform === "instagram" ? (
                          <Instagram className="w-4 h-4 text-pink-600" />
                        ) : (
                          <Facebook className="w-4 h-4 text-blue-600" />
                        )}
                        <span className="truncate max-w-[120px]">{parentPage?.name}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{dateStr}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">{likes.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">{comments.toLocaleString()}</td>
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
