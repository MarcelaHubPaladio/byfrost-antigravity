import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus, MessageSquare, Calendar, CheckCircle2, Clock, XCircle, AlertCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppShell";
import { useSmartCampaigns, CampaignStatus, CampaignType } from "@/hooks/useSmartCampaigns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SmartCampaigns() {
  const navigate = useNavigate();
  const { campaigns, isLoading } = useSmartCampaigns();
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredCampaigns = campaigns?.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (typeFilter !== "all" && c.campaign_type !== typeFilter) return false;
    return true;
  });

  const getStatusIcon = (status: CampaignStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'processing': return <Play className="w-4 h-4 text-blue-500" />;
      case 'scheduled': return <Calendar className="w-4 h-4 text-purple-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled': return <AlertCircle className="w-4 h-4 text-gray-500" />;
      case 'tested': return <CheckCircle2 className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: CampaignStatus) => {
    switch (status) {
      case 'completed': return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case 'processing': return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case 'scheduled': return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case 'failed': return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case 'tested': return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const getTypeLabel = (type: CampaignType) => {
    const types: Record<CampaignType, string> = {
      boleto: "Boleto",
      nota_fiscal: "Nota Fiscal",
      video_aprovacao: "Vídeo p/ Aprovação",
      comunicado: "Comunicado",
      cobranca: "Cobrança",
      pos_venda: "Pós-venda",
      aviso: "Aviso",
      outro: "Outro"
    };
    return types[type] || type;
  };

  return (
    <AppShell>
      <div className="flex-1 w-full h-full overflow-auto bg-transparent">
        <div className="p-2 md:p-8 max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-blue-500" />
              Disparos Inteligentes
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Gerencie comunicados e envios programados via WhatsApp
            </p>
          </div>
          
          <Button 
            onClick={() => navigate("/app/smart-campaigns/new")}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Novo Disparo
          </Button>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-xl bg-white/50 dark:bg-slate-900/50">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <CardTitle className="text-lg font-medium">Todos os Disparos</CardTitle>
              <div className="flex gap-3 w-full sm:w-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Status</SelectItem>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="tested">Testado</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="processing">Em Andamento</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="nota_fiscal">Nota Fiscal</SelectItem>
                    <SelectItem value="video_aprovacao">Vídeo para Aprovação</SelectItem>
                    <SelectItem value="comunicado">Comunicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredCampaigns?.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">Nenhum disparo encontrado</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Crie seu primeiro disparo clicando no botão "Novo Disparo" acima.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
                    <tr>
                      <th className="px-6 py-4">Nome do Disparo</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Instância Z-API</th>
                      <th className="px-6 py-4">Agendamento</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredCampaigns?.map((campaign) => (
                      <tr 
                        key={campaign.id}
                        onClick={() => navigate(`/app/smart-campaigns/${campaign.id}`)}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                          {campaign.name}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-600 dark:text-slate-300">
                            {getTypeLabel(campaign.campaign_type)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-500 dark:text-slate-400">
                            {campaign.wa_instance?.name || "Desconhecida"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-500 dark:text-slate-400">
                            {campaign.scheduled_at 
                              ? format(new Date(campaign.scheduled_at), "dd/MM/yyyy HH:mm") 
                              : "Imediato"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className={`flex w-fit items-center gap-1.5 ${getStatusColor(campaign.status)}`}>
                            {getStatusIcon(campaign.status)}
                            <span className="capitalize">{campaign.status}</span>
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
    </AppShell>
  );
}
