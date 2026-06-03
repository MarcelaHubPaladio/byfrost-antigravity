import { supabase } from "@/lib/supabase";

export async function calculateCommissionForOrders(
  tenantId: string,
  sellerId: string,
  periodFrom: Date,
  periodTo: Date,
  orders: any[],
  caseDataFields: Map<string, any>,
  caseDataTotals: Map<string, number>
) {
  // 1. Fetch user rules
  let commissionRules = null;
  let sellerName = "";

  const { data: userData, error: userError } = await supabase
    .from("users_profile")
    .select("display_name, meta_json")
    .eq("tenant_id", tenantId)
    .eq("user_id", sellerId)
    .single();

  if (!userError && userData) {
    commissionRules = userData.meta_json?.commission_rules;
    sellerName = userData.display_name || "Vendedor";
  } else {
    // try vendor
    const { data: vendorData, error: vendorError } = await supabase
      .from("vendors")
      .select("display_name, id")
      .eq("tenant_id", tenantId)
      .eq("id", sellerId)
      .single();
    
    if (!vendorError && vendorData) {
      sellerName = vendorData.display_name || "Vendedor";
      // try to find profile by name
      const { data: profile } = await supabase
        .from("users_profile")
        .select("meta_json")
        .eq("tenant_id", tenantId)
        .eq("display_name", sellerName)
        .limit(1)
        .maybeSingle();
      if (profile) {
        commissionRules = profile.meta_json?.commission_rules;
      }
    }
  }

  if (!commissionRules) {
    commissionRules = {
      base_percent: 0,
      discount_tiers: [],
    };
  }

  const basePercent = commissionRules.base_percent || 0;
  const tiers = commissionRules.discount_tiers || [];

  // Calculate commission
  const calculatedOrders = [];
  let grandTotalSales = 0;
  let grandTotalCommission = 0;

  for (const order of orders) {
    // Get case items to calculate exact discount if possible
    const { data: items } = await supabase
      .from("case_items")
      .select("qty, price, discount_percent, total, commission_value, description, code")
      .eq("case_id", order.id);

    let orderTotalValue = caseDataTotals.get(order.id) || 0;
    let orderCommission = 0;
    const enrichedItems: any[] = [];

    if (items && items.length > 0) {
      for (const item of items) {
        let rowCommission = 0;
        if (item.commission_value != null) {
          rowCommission = Number(item.commission_value);
        } else {
          // Fallback calculation
          const rowTotal = Number(item.total || 0);
          const discountPct = Number(item.discount_percent || 0);
          const applicableTier = tiers.find((t: any) => t.max_discount_pct >= discountPct);
          const pct = applicableTier ? applicableTier.commission_pct : basePercent;
          rowCommission = rowTotal * (pct / 100);
        }
        orderCommission += rowCommission;

        const prodName = item.description || item.code || "Item";
        enrichedItems.push({
          name: prodName,
          qty: item.qty || 1,
          price: item.price || 0,
          discount_percent: item.discount_percent || 0,
          total: item.total || 0,
          commission_value: rowCommission
        });
      }
    } else {
      // Fallback: no items, use base percent
      orderCommission = orderTotalValue * (basePercent / 100);
    }

    grandTotalSales += orderTotalValue;
    grandTotalCommission += orderCommission;

    const f = caseDataFields.get(order.id);
    // Find billing date if stored in caseDataFields, or fallback to updated_at / current date
    const billingDate = f?.billing_date || f?.data_faturamento || order.updated_at || order.created_at;

    calculatedOrders.push({
      case_id: order.id,
      title: order.title,
      customer_name: "Cliente", // To be filled from map if passed
      total_value: orderTotalValue,
      commission_value: orderCommission,
      sale_date: order.created_at,
      billing_date: billingDate,
      billing_status: f?.billing_status || "Pendente",
      items: enrichedItems,
    });
  }

  return {
    seller_id: sellerId,
    seller_name: sellerName,
    period: {
      from: periodFrom.toISOString(),
      to: periodTo.toISOString()
    },
    total_sales: grandTotalSales,
    total_commission: grandTotalCommission,
    orders: calculatedOrders,
    rules_applied: commissionRules
  };
}

export async function calculateCommissionForSingleOrder(
  orderId: string,
  commissionRules: any
) {
  // Fetch order
  const { data: order } = await supabase
    .from("cases")
    .select("*, customer_accounts(*)")
    .eq("id", orderId)
    .single();

  if (!order) throw new Error("Pedido não encontrado");

  // Fetch items
  const { data: items } = await supabase
    .from("case_items")
    .select("qty, price, discount_percent, total, commission_value, description, code")
    .eq("case_id", orderId);

  // Fetch fields
  const { data: fields } = await supabase
    .from("case_fields")
    .select("key, value_text")
    .eq("case_id", orderId);

  const basePercent = commissionRules?.base_percent || 0;
  const tiers = commissionRules?.discount_tiers || [];

  let orderTotalValue = 0;
  let orderCommission = 0;
  const enrichedItems: any[] = [];

  if (items && items.length > 0) {
    for (const item of items) {
      const rowTotal = Number(item.total || 0);
      orderTotalValue += rowTotal;

      let rowCommission = 0;
      if (item.commission_value != null) {
        rowCommission = Number(item.commission_value);
      } else {
        const discountPct = Number(item.discount_percent || 0);
        const applicableTier = tiers.find((t: any) => t.max_discount_pct >= discountPct);
        const pct = applicableTier ? applicableTier.commission_pct : basePercent;
        rowCommission = rowTotal * (pct / 100);
      }
      orderCommission += rowCommission;

      const prodName = item.description || item.code || "Item";
      enrichedItems.push({
        name: prodName,
        qty: item.qty || 1,
        price: item.price || 0,
        discount_percent: item.discount_percent || 0,
        total: item.total || 0,
        commission_value: rowCommission
      });
    }
  } else {
    // try to get from total if no items
    const totalField = fields?.find(f => f.key === "valor_total" || f.key === "total");
    orderTotalValue = totalField ? Number(totalField.value_text) : 0;
    orderCommission = orderTotalValue * (basePercent / 100);
  }

  const billingStatus = fields?.find(f => f.key === "billing_status")?.value_text || "Pendente";
  const billingDateStr = fields?.find(f => f.key === "billing_date" || f.key === "data_faturamento")?.value_text;
  const billingDate = billingDateStr || order.updated_at || order.created_at;
  const customerName = order.customer_accounts?.name || "Cliente";

  return {
    case_id: order.id,
    title: order.title,
    customer_name: customerName,
    total_value: orderTotalValue,
    commission_value: orderCommission,
    sale_date: order.created_at,
    billing_date: billingDate,
    billing_status: billingStatus,
    items: enrichedItems,
  };
}

export function generatePDF(report: any) {
  const newWin = window.open("", "_blank");
  if (!newWin) return;

  const html = `
    <html>
      <head>
        <title>Relatório de Comissões - ${report.seller_name}</title>
        <style>
          body { font-family: sans-serif; color: #333; margin: 40px; }
          h1 { color: #4338ca; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          .summary { display: flex; gap: 40px; margin-top: 20px; background: #f8fafc; padding: 20px; border-radius: 8px; }
          .summary div { display: flex; flex-direction: column; }
          .summary span.label { font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .summary span.value { font-size: 24px; font-weight: bold; color: #0f172a; }
          .right { text-align: right; }
          .items-table { margin: 10px 0 10px 20px; width: calc(100% - 20px); font-size: 12px; }
          .items-table th { background-color: #f1f5f9; color: #475569; }
          .items-table td { color: #475569; }
          .no-items { font-size: 12px; font-style: italic; color: #94a3b8; padding-left: 20px; }
        </style>
      </head>
      <body>
        <h1>Relatório de Comissões</h1>
        <div><strong>Vendedor:</strong> ${report.seller_name}</div>
        <div><strong>Período:</strong> ${new Date(report.period.from).toLocaleDateString("pt-BR")} a ${new Date(report.period.to).toLocaleDateString("pt-BR")}</div>
        
        <div class="summary">
          <div>
            <span class="label">Total de Vendas Faturadas</span>
            <span class="value">${(report.total_sales || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
          <div>
            <span class="label">Total de Comissões</span>
            <span class="value">${(report.total_commission || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        </div>

        <h2>Pedidos</h2>
        <table>
          <thead>
            <tr>
              <th>ID Pedido</th>
              <th>Data</th>
              <th>Cliente</th>
              <th class="right">Valor Total</th>
              <th class="right">Comissão Calculada</th>
            </tr>
          </thead>
          <tbody>
            ${report.orders?.map((o: any) => `
              <tr>
                <td><strong>${o.case_id.slice(0, 8)}...</strong></td>
                <td><strong>${new Date(o.sale_date || o.date).toLocaleDateString("pt-BR")}</strong></td>
                <td><strong>${o.customer_name || o.title}</strong></td>
                <td class="right"><strong>${(o.total_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></td>
                <td class="right"><strong>${(o.commission_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></td>
              </tr>
              <tr>
                <td colspan="5" style="padding: 0; border-top: none;">
                  ${o.items && o.items.length > 0 ? `
                    <table class="items-table">
                      <thead>
                        <tr>
                          <th>Produto/Serviço</th>
                          <th>Qtd</th>
                          <th class="right">Preço Unit.</th>
                          <th class="right">Total Item</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${o.items.map((it: any) => `
                          <tr>
                            <td>${it.name}</td>
                            <td>${it.qty}</td>
                            <td class="right">${(it.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td class="right">${(it.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  ` : `
                    <p class="no-items">Sem detalhamento de itens no pedido.</p>
                  `}
                </td>
              </tr>
            `).join("") || ""}
          </tbody>
        </table>
        
        <p style="margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center;">Gerado pelo Byfrost</p>
      </body>
    </html>
  `;

  newWin.document.write(html);
  newWin.document.close();
  setTimeout(() => {
    newWin.print();
  }, 500);
}

export async function saveCommissionReport(tenantId: string, reportData: any) {
  const { data, error } = await supabase.from("core_entities").insert({
    tenant_id: tenantId,
    entity_type: "commission_report",
    display_name: `Fechamento ${reportData.seller_name} - ${new Date(reportData.period.from).toLocaleDateString("pt-BR")} a ${new Date(reportData.period.to).toLocaleDateString("pt-BR")}`,
    metadata: reportData,
    status: "active"
  }).select("id").single();

  if (error) throw error;
  return data;
}
