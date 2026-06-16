import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { OrdersTerritoryMap } from "@/components/orders/OrdersTerritoryMap";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";


// Componente simples para tela cheia (TV / Totem)
export default function OrdersTerritoryDashboard() {
  const { activeTenantId } = useTenant();

  // Fetch journey
  const journeyQ = useQuery({
    queryKey: ["journey_orders_dashboard", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id,key")
        .eq("key", "sales_order")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const selectedJourney = journeyQ.data;

  // Fetch active cases
  const casesQ = useQuery({
    queryKey: ["cases_orders_dashboard", activeTenantId, selectedJourney?.id],
    enabled: Boolean(activeTenantId && selectedJourney?.id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,title,status,state,created_at,assigned_user_id,assigned_vendor_id,users_profile:users_profile!fk_cases_users_profile(display_name,email),assigned_vendor:vendors!cases_assigned_vendor_id_fkey(display_name),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const journeyRows = casesQ.data ?? [];

  // Tela de loading
  if (!activeTenantId || journeyQ.isLoading || casesQ.isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
      </div>
    );
  }

  // A tela principal renderiza o mapa ocupando 100vw e 100vh.
  // Como as telas TV podem estar tanto na horizontal (1920x1080) quanto vertical (1080x1920),
  // flex-col md:flex-row garante adaptação baseada no width via Media Query.
  // Vamos passar isFullscreen={true} para o componente ocultar as bordas extras e barras de busca se for preciso.
  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-900 text-slate-100 flex relative">
      <div className="absolute top-6 left-6 z-[1000]">
        <Link 
          to="/app/orders" 
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full shadow-lg border border-slate-700 backdrop-blur-md transition-colors text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Pedidos
        </Link>
      </div>
      <div className="flex-1 w-full h-full p-4">
        <OrdersTerritoryMap cases={journeyRows} isFullscreen={true} />
      </div>
    </div>
  );
}
