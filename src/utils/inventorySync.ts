import { supabase } from "@/lib/supabase";

interface DraftItem {
  id?: string;
  offering_entity_id: string | null;
  qty: number;
  config_id?: string | null;
}

/**
 * Ajusta o estoque do inventário com base na diferença entre o rascunho de itens e o que está no banco de dados.
 */
export async function adjustInventoryForOrderItems(
  caseId: string,
  newItems: DraftItem[],
  userId: string
) {
  // 1. Busca os itens antigos já cadastrados no banco
  const { data: oldItems, error: fetchErr } = await supabase
    .from("case_items")
    .select("id, offering_entity_id, qty, confidence_json")
    .eq("case_id", caseId);

  if (fetchErr) throw fetchErr;

  const oldItemsList = oldItems || [];

  // Mapeia os itens antigos por ID
  const oldMap = new Map<string, typeof oldItemsList[0]>();
  for (const item of oldItemsList) {
    oldMap.set(item.id, item);
  }

  // Acumula os deltas de estoque necessários
  // key: productId + ":" + (configId || "none")
  const deltas: Record<string, { productId: string; configId: string | null; diff: number }> = {};

  const getOrCreateDelta = (productId: string, configId: string | null) => {
    const key = `${productId}:${configId || "none"}`;
    if (!deltas[key]) {
      deltas[key] = { productId, configId, diff: 0 };
    }
    return deltas[key];
  };

  // Itens novos ou atualizados
  for (const newItem of newItems) {
    if (!newItem.offering_entity_id) continue;

    const oldItem = newItem.id ? oldMap.get(newItem.id) : null;
    const oldConfigId = oldItem?.confidence_json?.config_id || null;
    const newConfigId = newItem.config_id || null;

    if (oldItem) {
      // O item já existia.
      if (oldItem.offering_entity_id !== newItem.offering_entity_id || oldConfigId !== newConfigId) {
        // Mudou o produto ou a configuração: trata como devolução do antigo e débito do novo
        const dOld = getOrCreateDelta(oldItem.offering_entity_id, oldConfigId);
        dOld.diff -= Number(oldItem.qty || 0);

        const dNew = getOrCreateDelta(newItem.offering_entity_id, newConfigId);
        dNew.diff += Number(newItem.qty || 0);
      } else {
        // Mesmo produto e config: calcula a diferença
        const d = getOrCreateDelta(newItem.offering_entity_id, newConfigId);
        d.diff += (Number(newItem.qty) - Number(oldItem.qty || 0));
      }
    } else {
      // Item totalmente novo
      const d = getOrCreateDelta(newItem.offering_entity_id, newConfigId);
      d.diff += Number(newItem.qty);
    }
  }

  // Itens deletados (estavam no banco mas não estão no rascunho)
  const newIds = new Set(newItems.map(x => x.id).filter(Boolean));
  for (const oldItem of oldItemsList) {
    if (!newIds.has(oldItem.id) && oldItem.offering_entity_id) {
      const oldConfigId = oldItem.confidence_json?.config_id || null;
      const d = getOrCreateDelta(oldItem.offering_entity_id, oldConfigId);
      d.diff -= Number(oldItem.qty || 0);
    }
  }

  // Processa as atualizações de estoque no banco para cada delta
  for (const key of Object.keys(deltas)) {
    const { productId, configId, diff } = deltas[key];
    if (diff === 0) continue;

    // Carrega o produto atual
    const { data: product, error: prodErr } = await supabase
      .from("core_entities")
      .select("*")
      .eq("id", productId)
      .single();

    if (prodErr) throw prodErr;
    if (!product) continue;

    const metadata = { ...product.metadata };
    const allowOutOfStock = !!metadata.allow_out_of_stock_sales;

    let oldLoja = 0;
    let oldConsignado = 0;
    let oldTotal = 0;
    let newLoja = 0;
    let newConsignado = 0;
    let newTotal = 0;
    let configName = "";

    if (configId && Array.isArray(metadata.configurations)) {
      // Atualização em uma variação/configuração
      const configurations = [...metadata.configurations];
      const idx = configurations.findIndex((c: any) => c.id === configId);
      if (idx === -1) {
        throw new Error(`Configuração não encontrada no produto ${product.display_name}.`);
      }

      const cfg = { ...configurations[idx] };
      configName = cfg.name;
      oldLoja = Number(cfg.estoque_loja || 0);
      oldConsignado = Number(cfg.estoque_consignado || 0);
      oldTotal = Number(cfg.estoque_total || 0);

      if (diff > 0 && !allowOutOfStock && oldLoja < diff) {
        throw new Error(
          `Estoque insuficiente para a variação "${cfg.name}" do produto "${product.display_name}". Disponível na loja: ${oldLoja}, Solicitado: ${diff}`
        );
      }

      newLoja = oldLoja - diff;
      newConsignado = oldConsignado;
      newTotal = newLoja + newConsignado;

      cfg.estoque_loja = newLoja;
      cfg.estoque_total = newTotal;
      configurations[idx] = cfg;
      metadata.configurations = configurations;
    } else {
      // Atualização no estoque direto do produto
      oldLoja = Number(metadata.estoque_loja || 0);
      oldConsignado = Number(metadata.estoque_consignado || 0);
      oldTotal = Number(metadata.estoque_total || 0);

      if (diff > 0 && !allowOutOfStock && oldLoja < diff) {
        throw new Error(
          `Estoque insuficiente para o produto "${product.display_name}". Disponível na loja: ${oldLoja}, Solicitado: ${diff}`
        );
      }

      newLoja = oldLoja - diff;
      newConsignado = oldConsignado;
      newTotal = newLoja + newConsignado;

      metadata.estoque_loja = newLoja;
      metadata.estoque_total = newTotal;
    }

    // Persiste no banco de dados
    const { error: updErr } = await supabase
      .from("core_entities")
      .update({ metadata })
      .eq("id", productId);

    if (updErr) throw updErr;

    // Loga no histórico (timeline do produto)
    const { error: logErr } = await supabase.from("core_entity_events").insert({
      tenant_id: product.tenant_id,
      entity_id: productId,
      event_type: "stock_change",
      before: {
        estoque_loja: oldLoja,
        estoque_consignado: oldConsignado,
        estoque_total: oldTotal,
        config_id: configId,
        config_name: configName
      },
      after: {
        estoque_loja: newLoja,
        estoque_consignado: newConsignado,
        estoque_total: newTotal,
        config_id: configId,
        config_name: configName,
        change_qty: -diff, // quantidade consumida (-) ou devolvida (+)
        reason: diff > 0 ? "Reserva de estoque para pedido" : "Devolução de itens do pedido",
        case_id: caseId
      },
      actor_user_id: userId || null,
      created_at: new Date().toISOString()
    });

    if (logErr) console.error("Falha ao registrar histórico de estoque:", logErr);
  }
}

/**
 * Trata o estoque ao mudar a etapa do pedido comercial.
 * Ex: Se foi cancelado, devolve o estoque. Se foi reaberto a partir de cancelado, reserva o estoque.
 */
export async function handleOrderStateTransition(
  caseId: string,
  oldState: string,
  newState: string,
  userId: string
) {
  const isOldCancelled = (oldState || "").toLowerCase() === "cancelled" || (oldState || "").toLowerCase() === "cancelado";
  const isNewCancelled = (newState || "").toLowerCase() === "cancelled" || (newState || "").toLowerCase() === "cancelado";

  if (isOldCancelled === isNewCancelled) return; // Nenhuma mudança de/para cancelado

  // Busca os itens do pedido
  const { data: items, error: itemsErr } = await supabase
    .from("case_items")
    .select("id, offering_entity_id, qty, confidence_json")
    .eq("case_id", caseId);

  if (itemsErr) throw itemsErr;
  if (!items || items.length === 0) return;

  if (isNewCancelled) {
    // Pedido foi Cancelado: Devolve todo o estoque reservado
    for (const item of items) {
      if (!item.offering_entity_id) continue;
      const configId = item.confidence_json?.config_id || null;
      const qty = Number(item.qty || 0);

      // Carrega o produto
      const { data: product, error: prodErr } = await supabase
        .from("core_entities")
        .select("*")
        .eq("id", item.offering_entity_id)
        .single();

      if (prodErr) throw prodErr;
      if (!product) continue;

      const metadata = { ...product.metadata };
      let oldLoja = 0, oldConsignado = 0, oldTotal = 0;
      let newLoja = 0, newConsignado = 0, newTotal = 0;
      let configName = "";

      if (configId && Array.isArray(metadata.configurations)) {
        const configurations = [...metadata.configurations];
        const idx = configurations.findIndex((c: any) => c.id === configId);
        if (idx !== -1) {
          const cfg = { ...configurations[idx] };
          configName = cfg.name;
          oldLoja = Number(cfg.estoque_loja || 0);
          oldConsignado = Number(cfg.estoque_consignado || 0);
          oldTotal = Number(cfg.estoque_total || 0);

          newLoja = oldLoja + qty;
          newConsignado = oldConsignado;
          newTotal = newLoja + newConsignado;

          cfg.estoque_loja = newLoja;
          cfg.estoque_total = newTotal;
          configurations[idx] = cfg;
          metadata.configurations = configurations;
        }
      } else {
        oldLoja = Number(metadata.estoque_loja || 0);
        oldConsignado = Number(metadata.estoque_consignado || 0);
        oldTotal = Number(metadata.estoque_total || 0);

        newLoja = oldLoja + qty;
        newConsignado = oldConsignado;
        newTotal = newLoja + newConsignado;

        metadata.estoque_loja = newLoja;
        metadata.estoque_total = newTotal;
      }

      // Atualiza o produto
      await supabase.from("core_entities").update({ metadata }).eq("id", product.id);

      // Loga no histórico
      await supabase.from("core_entity_events").insert({
        tenant_id: product.tenant_id,
        entity_id: product.id,
        event_type: "stock_change",
        before: { estoque_loja: oldLoja, estoque_consignado: oldConsignado, estoque_total: oldTotal, config_id: configId, config_name: configName },
        after: {
          estoque_loja: newLoja,
          estoque_consignado: newConsignado,
          estoque_total: newTotal,
          config_id: configId,
          config_name: configName,
          change_qty: qty,
          reason: "Pedido Cancelado - Devolução",
          case_id: caseId
        },
        actor_user_id: userId || null,
        created_at: new Date().toISOString()
      });
    }
  } else if (isOldCancelled) {
    // Pedido foi Reaberto: Reserva novamente o estoque dos itens
    for (const item of items) {
      if (!item.offering_entity_id) continue;
      const configId = item.confidence_json?.config_id || null;
      const qty = Number(item.qty || 0);

      // Carrega o produto
      const { data: product, error: prodErr } = await supabase
        .from("core_entities")
        .select("*")
        .eq("id", item.offering_entity_id)
        .single();

      if (prodErr) throw prodErr;
      if (!product) continue;

      const metadata = { ...product.metadata };
      const allowOutOfStock = !!metadata.allow_out_of_stock_sales;
      let oldLoja = 0, oldConsignado = 0, oldTotal = 0;
      let newLoja = 0, newConsignado = 0, newTotal = 0;
      let configName = "";

      if (configId && Array.isArray(metadata.configurations)) {
        const configurations = [...metadata.configurations];
        const idx = configurations.findIndex((c: any) => c.id === configId);
        if (idx !== -1) {
          const cfg = { ...configurations[idx] };
          configName = cfg.name;
          oldLoja = Number(cfg.estoque_loja || 0);
          oldConsignado = Number(cfg.estoque_consignado || 0);
          oldTotal = Number(cfg.estoque_total || 0);

          if (!allowOutOfStock && oldLoja < qty) {
            throw new Error(
              `Estoque insuficiente para a variação "${cfg.name}" do produto "${product.display_name}". Disponível na loja: ${oldLoja}, Reabertura solicitou: ${qty}`
            );
          }

          newLoja = oldLoja - qty;
          newConsignado = oldConsignado;
          newTotal = newLoja + newConsignado;

          cfg.estoque_loja = newLoja;
          cfg.estoque_total = newTotal;
          configurations[idx] = cfg;
          metadata.configurations = configurations;
        }
      } else {
        oldLoja = Number(metadata.estoque_loja || 0);
        oldConsignado = Number(metadata.estoque_consignado || 0);
        oldTotal = Number(metadata.estoque_total || 0);

        if (!allowOutOfStock && oldLoja < qty) {
          throw new Error(
            `Estoque insuficiente para o produto "${product.display_name}". Disponível na loja: ${oldLoja}, Reabertura solicitou: ${qty}`
          );
        }

        newLoja = oldLoja - qty;
        newConsignado = oldConsignado;
        newTotal = newLoja + newConsignado;

        metadata.estoque_loja = newLoja;
        metadata.estoque_total = newTotal;
      }

      // Atualiza o produto
      await supabase.from("core_entities").update({ metadata }).eq("id", product.id);

      // Loga no histórico
      await supabase.from("core_entity_events").insert({
        tenant_id: product.tenant_id,
        entity_id: product.id,
        event_type: "stock_change",
        before: { estoque_loja: oldLoja, estoque_consignado: oldConsignado, estoque_total: oldTotal, config_id: configId, config_name: configName },
        after: {
          estoque_loja: newLoja,
          estoque_consignado: newConsignado,
          estoque_total: newTotal,
          config_id: configId,
          config_name: configName,
          change_qty: -qty,
          reason: "Pedido Reaberto - Reserva",
          case_id: caseId
        },
        actor_user_id: userId || null,
        created_at: new Date().toISOString()
      });
    }
  }
}
