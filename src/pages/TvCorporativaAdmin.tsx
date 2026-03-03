import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TvPointsManage } from "@/components/tv/TvPointsManage";
import { TvPlansManage } from "@/components/tv/TvPlansManage";

export default function TvCorporativaAdmin() {
    const { activeTenantId } = useTenant();

    return (
        <AppShell>
            <div className="mx-auto w-full max-w-6xl space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        TV Corporativa
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Gerencie os pontos de TV, planos e aprovações de mídia.
                    </p>
                </div>

                {activeTenantId ? (
                    <Tabs defaultValue="points" className="w-full">
                        <TabsList>
                            <TabsTrigger value="points">Pontos de TV</TabsTrigger>
                            <TabsTrigger value="plans">Planos de Mídia</TabsTrigger>
                            <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
                        </TabsList>

                        <TabsContent value="points" className="pt-4">
                            <TvPointsManage tenantId={activeTenantId} />
                        </TabsContent>

                        <TabsContent value="plans" className="pt-4">
                            <TvPlansManage tenantId={activeTenantId} />
                        </TabsContent>

                        <TabsContent value="timeline" className="pt-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <p className="text-sm text-slate-600">
                                    Gestão da linha do tempo da TV. Aqui você poderá associar vídeos aos pontos de TV. (Em desenvolvimento)
                                </p>
                            </div>
                        </TabsContent>
                    </Tabs>
                ) : null}
            </div>
        </AppShell>
    );
}
