import { Card } from "@/components/ui/card";

export function EntityTvCorporativaTab({
    tenantId,
    entityId,
}: {
    tenantId: string;
    entityId: string;
}) {
    return (
        <div className="space-y-4">
            <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Mídia e TV Corporativa</h3>
                <p className="mt-2 text-sm text-slate-600">
                    Faça o upload de vídeos ou cole o link do Google Drive para que sejam exibidos nos Pontos de TV da sua empresa.
                </p>

                {/* Placeholder para formulário e listagem de mídia */}
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Configurações de mídia (Em desenvolvimento)
                </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Plano Ativo</h3>
                <p className="mt-2 text-sm text-slate-600">
                    Selecione o plano de TV corporativa que será ativado para esta mídia. O plano dita o tempo de exibição e layouts finais.
                </p>

                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Configuração de plano (Em desenvolvimento)
                </div>
            </Card>
        </div>
    );
}
