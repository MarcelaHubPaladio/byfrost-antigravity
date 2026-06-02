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
      .select("qty, price, discount_percent, total, commission_value, description, custom_price, product_id, products(name)")
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

        const prodName = item.products?.name || item.description || "Item";
        enrichedItems.push({
          name: prodName,
          qty: item.qty || 1,
          price: item.custom_price || item.price || 0,
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
