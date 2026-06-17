import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { ExternalLink, Package, ReceiptText, CalendarClock } from "lucide-react";

export function EntitySalesOrdersTab(props: { tenantId: string; entityId: string }) {
    const ordersQ = useQuery({
        queryKey: ["entity_sales_orders", props.tenantId, props.entityId],
        enabled: Boolean(props.tenantId && props.entityId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("cases")
                .select("id, status, state, title, created_at, meta_json")
                .eq("tenant_id", props.tenantId)
                .or(`customer_entity_id.eq.${props.entityId},customer_id.eq.${props.entityId}`)
                .eq("case_type", "order")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        },
    });

    if (ordersQ.isLoading) {
        return <div className="p-4 text-sm text-slate-500">Carregando pedidos...</div>;
    }

    const orders = ordersQ.data || [];

    return (
        <Card className="rounded-2xl border-slate-200 p-0 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <ReceiptText className="w-4 h-4 text-slate-500" />
                    Pedidos de Venda
                    <Badge variant="secondary" className="ml-2 font-mono">{orders.length}</Badge>
                </h3>
            </div>

            <div className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                    <div className="p-8 flex flex-col items-center justify-center text-slate-400">
                        <Package className="w-12 h-12 mb-3 opacity-20" />
                        <p>Nenhum pedido de venda encontrado para este cliente.</p>
                    </div>
                ) : (
                    orders.map((order) => {
                        const dateStr = format(new Date(order.created_at), "dd 'de' MMM, yyyy 'às' HH:mm", { locale: ptBR });
                        return (
                            <div key={order.id} className="p-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                                <div>
                                    <div className="flex gap-2 items-center mb-1">
                                        <span className="font-semibold text-slate-900 text-sm">
                                            {order.title || "Pedido S/N"}
                                        </span>
                                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider rounded-md">
                                            {order.status}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <CalendarClock className="w-3.5 h-3.5" />
                                            {dateStr}
                                        </span>
                                        {order.state && (
                                            <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium text-slate-700">
                                                Fase: {order.state}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end shrink-0">
                                    <Button asChild variant="secondary" size="sm" className="rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                        <Link to={`/app/orders/${order.id}`}>
                                            Abrir Pedido <ExternalLink className="w-3.5 h-3.5 ml-2" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
}
