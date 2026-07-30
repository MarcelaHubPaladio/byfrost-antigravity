// supabase/functions/_shared/beeiaPromptBuilder.ts

export async function buildBeeIASystemPrompt(options: {
  supabase: any;
  tenantId: string;
  caseId?: string | null;
  config: { system_prompt?: string; target_stage?: string };
  inboundHistoryMsgs?: string[];
}): Promise<{
  sysPrompt: string;
  crmTargetStage: string;
  crmAssigneeId: string | null;
}> {
  const { supabase, tenantId, caseId, config, inboundHistoryMsgs } = options;
  
  let sysPrompt = config?.system_prompt || 'Você é a BeeIA, assistente virtual de atendimento da empresa. Responda educadamente às dúvidas do cliente sobre nossos produtos e serviços. Caso o cliente queira falar com um atendente humano ou demonstre interesse real em fechar negócio, finalize sua mensagem incluindo a tag [STAGE_TRANSITION] no final da sua resposta.';
  const targetStage = config?.target_stage || 'morno';

  // 1. Fetch Learnings
  const { data: learnings, error: lrnErr } = await supabase
    .from("beeia_learnings")
    .select("learning_text")
    .eq("tenant_id", tenantId);
  
  if (!lrnErr && learnings && learnings.length > 0) {
    sysPrompt += "\n\n[REGRAS APRENDIDAS EM TREINAMENTOS ANTERIORES]:\n";
    learnings.forEach((l: any, i: number) => {
      sysPrompt += `${i + 1}. ${l.learning_text}\n`;
    });
  }

  // 2. Fetch active Plugs
  const { data: plugs, error: plugsErr } = await supabase
    .from("beeia_plugs")
    .select("plug_key, is_enabled, config_json")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true);

  let crmTargetStage = targetStage;
  let crmAssigneeId = null;

  if (!plugsErr && plugs && plugs.length > 0) {
    sysPrompt += "\n\n[INTEGRAÇÕES E RECURSOS DO SISTEMA ATIVOS]:\n";
    
    // CRM Plugue
    const crmPlug = plugs.find((p: any) => p.plug_key === "crm_journeys");
    if (crmPlug) {
      crmTargetStage = crmPlug.config_json?.target_stage || targetStage;
      crmAssigneeId = crmPlug.config_json?.assigned_user_id || null;
      sysPrompt += `- CRM & Encaminhamento: A IA qualificará os leads interessados e os moverá para a etapa "${crmTargetStage}".\n`;
    }

    // Entidades Catalog Plugue
    const coreEntPlug = plugs.find((p: any) => p.plug_key === "core_entities");
    if (coreEntPlug) {
      const allowedFields = coreEntPlug.config_json?.allowed_fields || [];
      const limitInstructions = coreEntPlug.config_json?.limit_instructions || "";

      let propEntity = null;
      if (caseId) {
        // Query Case Items offering linked to this case
        const { data: propItem } = await supabase
          .from("case_items")
          .select("offering_entity_id")
          .eq("case_id", caseId)
          .limit(1)
          .maybeSingle();

        if (propItem?.offering_entity_id) {
          const { data: ent } = await supabase
            .from("core_entities")
            .select("*")
            .eq("id", propItem.offering_entity_id)
            .maybeSingle();
          propEntity = ent;
        }
      }

      if (!propEntity && inboundHistoryMsgs && inboundHistoryMsgs.length > 0) {
        for (const msgToScan of inboundHistoryMsgs) {
          const words = msgToScan.match(/[a-zA-Z0-9]+/g) || [];
          const cleanWords = words.map((w: string) => w.replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean);
          if (cleanWords.length > 0) {
            const searchTerms = Array.from(new Set([
              ...cleanWords,
              ...cleanWords.map((w: string) => w.toUpperCase()),
              ...cleanWords.map((w: string) => w.toLowerCase())
            ]));
            const { data: matchedEnt } = await supabase
              .from("core_entities")
              .select("*")
              .eq("tenant_id", tenantId)
              .eq("entity_type", "offering")
              .is("deleted_at", null)
              .or(`internal_code.in.(${searchTerms.join(",")}),legacy_id.in.(${searchTerms.join(",")})`)
              .limit(1)
              .maybeSingle();
            
            if (matchedEnt) {
              propEntity = matchedEnt;
              
              if (caseId) {
                // Auto-link property to case_items to persist in the database
                try {
                  const { data: maxItem } = await supabase
                    .from("case_items")
                    .select("line_no")
                    .eq("case_id", caseId)
                    .order("line_no", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  const nextLineNo = (maxItem?.line_no || 0) + 1;
                  
                  await supabase
                    .from("case_items")
                    .insert({
                      tenant_id: tenantId,
                      case_id: caseId,
                      offering_entity_id: matchedEnt.id,
                      line_no: nextLineNo,
                      qty: 1,
                      confidence_json: { source: "beeia_detection" }
                    });
                } catch (errLink) {
                  console.warn("[BEEIA] Failed to link offering to case_items", errLink);
                }
              }
              break;
            }
          }
        }
      }

      if (propEntity) {
        sysPrompt += `\n[IMÓVEL DE INTERESSE DO CLIENTE]:\n`;
        sysPrompt += `- Código Interno: ${propEntity.internal_code || "Sem código"}\n`;
        if (propEntity.legacy_id) {
          sysPrompt += `- Código Legado / ID no sistema: ${propEntity.legacy_id}\n`;
        }
        sysPrompt += `- Título/Nome: ${propEntity.display_name}\n`;
        
        const meta = propEntity.metadata || {};
        if (allowedFields.includes("price")) {
          const pVal = propEntity.business_type === "rent" ? (meta.price_rent || meta.price_sale || meta.price) : (meta.price_sale || meta.price);
          const pStr = meta.price_consult || !pVal ? "Sob consulta" : Number(pVal).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
          sysPrompt += `- Preço: R$ ${pStr} (${propEntity.business_type === "rent" ? "Locação" : "Venda"})\n`;
        }
        if (allowedFields.includes("description") && meta.description) {
          sysPrompt += `- Descrição Comercial: ${meta.description}\n`;
        }
        if (meta.ad_url) {
          sysPrompt += `- Link do Anúncio (Mais detalhes): ${meta.ad_url}\n`;
        }
        if (allowedFields.includes("area")) {
          if (propEntity.total_area) sysPrompt += `- Área Total: ${propEntity.total_area} m²\n`;
          if (propEntity.useful_area) sysPrompt += `- Área Útil: ${propEntity.useful_area} m²\n`;
        }
        if (allowedFields.includes("rooms")) {
          if (meta.rooms) sysPrompt += `- Quartos: ${meta.rooms}\n`;
          if (meta.bathrooms) sysPrompt += `- Banheiros: ${meta.bathrooms}\n`;
          if (meta.suites) sysPrompt += `- Suítes: ${meta.suites}\n`;
          if (meta.garage) sysPrompt += `- Vagas: ${meta.garage}\n`;
        }
        if (allowedFields.includes("location") && propEntity.location_json) {
          const loc = propEntity.location_json;
          sysPrompt += `- Localização: Bairro ${loc.neighborhood || ""}, ${loc.city || ""}-${loc.state || ""}\n`;
        }
        if (allowedFields.includes("photos")) {
          const { data: photos } = await supabase
            .from("core_entity_photos")
            .select("url, room_type")
            .eq("entity_id", propEntity.id)
            .eq("tenant_id", tenantId)
            .is("deleted_at", null);
          if (photos && photos.length > 0) {
            sysPrompt += `- Fotos oficiais para enviar ao cliente:\n`;
            photos.forEach((ph: any) => {
              sysPrompt += `  * ![Foto ${ph.room_type || 'Geral'}](${ph.url})\n`;
            });
          }
        }
      }

      // Load up to 5 other active properties/offerings
      const { data: otherProps } = await supabase
        .from("core_entities")
        .select("id, internal_code, display_name, metadata, business_type")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "offering")
        .eq("status", "active")
        .is("deleted_at", null)
        .neq("id", propEntity?.id || "00000000-0000-0000-0000-000000000000")
        .limit(5);

      if (otherProps && otherProps.length > 0) {
        sysPrompt += `\n[OUTROS IMÓVEIS DISPONÍVEIS NO PORTFÓLIO]:\n`;
        otherProps.forEach((op: any) => {
          const opMeta = op.metadata || {};
          const opVal = op.business_type === "rent" ? (opMeta.price_rent || opMeta.price_sale || opMeta.price) : (opMeta.price_sale || opMeta.price);
          const opStr = opMeta.price_consult || !opVal ? "Sob consulta" : Number(opVal).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
          sysPrompt += `- Cód: ${op.internal_code || "N/A"} | ${op.display_name} | Preço: R$ ${opStr} | Negócio: ${op.business_type === "rent" ? "Locação" : "Venda"}`;
          if (opMeta.ad_url) sysPrompt += ` | Link: ${opMeta.ad_url}`;
          sysPrompt += `\n`;
        });
      }

      if (limitInstructions) {
        sysPrompt += `\n[DIRETRIZES E LIMITES DE INFORMAÇÕES DE IMÓVEIS]:\n${limitInstructions}\n`;
      }

      sysPrompt += `\n[DIRETRIZES IMPORTANTES PARA APRESENTAÇÃO DE IMÓVEIS]:
- Liste APENAS as informações e características que possuem valor preenchido. NUNCA mostre campos vazios ou sem informação (ex: se não tem quartos informados, não escreva "Quartos:").
- Sempre inclua o "Link do Anúncio" no final da apresentação de cada imóvel, se a URL estiver disponível.
- Para enviar fotos, retorne EXATAMENTE no formato Markdown: ![Descrição](URL). O sistema interceptará e enviará a imagem real no WhatsApp.
`;
    }

    // Financeiro & Cobrança Plugue
    const finBillingPlug = plugs.find((p: any) => p.plug_key === "financial_billing");
    if (finBillingPlug) {
      const pixKey = finBillingPlug.config_json?.pix_key || "";
      const allowCheckReceivables = finBillingPlug.config_json?.allow_check_receivables ?? false;
      const billingInstructions = finBillingPlug.config_json?.billing_instructions || "";

      sysPrompt += `\n[INTEGRAÇÃO FINANCEIRA - FATURAS E PAGAMENTOS]:\n`;
      if (pixKey) {
        sysPrompt += `- Chave PIX Oficial para Recebimento: "${pixKey}"\n`;
      }

      if (allowCheckReceivables && caseId) {
        // Get customer account entity_id
        const { data: caseWithCust } = await supabase
          .from("cases")
          .select("customer_id")
          .eq("id", caseId)
          .maybeSingle();

        if (caseWithCust?.customer_id) {
          const { data: custAcc } = await supabase
            .from("customer_accounts")
            .select("entity_id")
            .eq("id", caseWithCust.customer_id)
            .maybeSingle();

          if (custAcc?.entity_id) {
            // Fetch unpaid receivables
            const { data: receivables } = await supabase
              .from("financial_receivables")
              .select("description, amount, due_date, status")
              .eq("entity_id", custAcc.entity_id)
              .neq("status", "paid")
              .is("deleted_at", null)
              .order("due_date", { ascending: true });

            if (receivables && receivables.length > 0) {
              sysPrompt += `- Faturas/Recebíveis em Aberto do Cliente Atual:\n`;
              receivables.forEach((r: any) => {
                const due = r.due_date ? new Date(r.due_date).toLocaleDateString("pt-BR") : "Não definida";
                sysPrompt += `  * "${r.description || 'Fatura'}" | Valor: R$ ${r.amount} | Vencimento: ${due} | Status: ${r.status}\n`;
              });
            } else {
              sysPrompt += `- O cliente atual NÃO possui faturas em aberto no momento.\n`;
            }
          }
        }
      }

      if (billingInstructions) {
        sysPrompt += `- Regras de Faturamento e Cobrança: ${billingInstructions}\n`;
      }
    }

    // Simulador de Financiamento Plugue
    const simPlug = plugs.find((p: any) => p.plug_key === "financing_simulator");
    if (simPlug) {
      const allowUseBankRules = simPlug.config_json?.allow_use_bank_rules ?? false;
      const customInstructions = simPlug.config_json?.custom_instructions || "";

      sysPrompt += `\n[INTEGRAÇÃO - SIMULADOR DE FINANCIAMENTO]:\n`;
      sysPrompt += `- OBRIGATÓRIO: Assim que tiver as informações necessárias (valor do imóvel e valor da entrada), realize o cálculo e entregue o resultado da simulação IMEDIATAMENTE na mesma mensagem. Nunca peça para o cliente aguardar ("um momento", "vou calcular") sem exibir os valores simulados.\n`;
      sysPrompt += `- FORMATO E DIAGRAMAÇÃO: Apresente os resultados de forma extremamente organizada, bonita e legível para o WhatsApp. Use quebras de linha duplas entre os blocos, emojis e marcadores. Estruture assim:
  * Exiba o resumo em tópicos (Valor do Imóvel, Entrada, Valor Financiado).
  * Exiba cada banco/opção como um bloco separado por uma linha em branco.
  * Para cada banco use negrito para destacar as informações fundamentais, por exemplo:
    🏦 **Caixa Econômica Federal (CEF)**
    - **Taxa:** 4,75% a.a.
    - **Prazo:** 420 meses
    - **Parcela Estimada:** R$ 2.305,00
  * Nunca junte tudo em um único parágrafo corrido.\n`;
      if (allowUseBankRules) {
        const { data: bankRules } = await supabase
          .from("financing_bank_rules")
          .select("bank_name, bank_code, base_rate_pct, max_term_months, tac_json, min_loan_value, max_loan_value")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .is("deleted_at", null);

        if (bankRules && bankRules.length > 0) {
          sysPrompt += `Você está integrado ao Simulador de Financiamento Imobiliário oficial. Use os parâmetros reais de taxas por banco:\n`;
          bankRules.forEach((br: any) => {
            sysPrompt += `- Banco: ${br.bank_name} (${br.bank_code}) | Taxa anual: ${br.base_rate_pct}% a.a. | Prazo máximo: ${br.max_term_months || 420} meses\n`;
          });
          
          sysPrompt += `\nInstruções de Cálculo de Financiamento:\n`;
          sysPrompt += `- Valor Financiado = Valor Imóvel - Entrada\n`;
          sysPrompt += `- SAC (Sistema de Amortização Constante):\n`;
          sysPrompt += `  * Amortização Mensal = Valor Financiado / Prazo (meses)\n`;
          sysPrompt += `  * Juros Mensais = Saldo Devedor * (Taxa Anual / 12 / 100)\n`;
          sysPrompt += `  * Seguro Estimado = (Saldo Devedor / 1000) * 0.28\n`;
          sysPrompt += `  * Parcela Mensal = Amortização + Juros + Seguro\n`;
          sysPrompt += `- PRICE (Parcelas Fixas): Calcule parcelas fixas brutas padrão de financiamento mensal usando fórmula PRICE padrão adicionando o seguro estimado.\n`;
        }
      }

      if (customInstructions) {
        sysPrompt += `- Regras de Financiamento: ${customInstructions}\n`;
      }
    }

    // Audio Plugue
    const audioPlug = plugs.find((p: any) => p.plug_key === "audio_transcription");
    if (audioPlug) {
      sysPrompt += `\n[INTEGRAÇÃO - ÁUDIO]:\n- Você é capaz de "escutar" mensagens de voz enviadas pelo cliente. O sistema irá transcrever o áudio automaticamente e incluir no histórico como [Áudio transcrito]. Trate essa mensagem como a fala real do cliente.\n`;
    }

    // Vision Plugue
    const visionPlug = plugs.find((p: any) => p.plug_key === "vision_interpretation");
    if (visionPlug) {
      sysPrompt += `\n[INTEGRAÇÃO - VISÃO COMPUTACIONAL]:\n- Você é capaz de "enxergar" imagens e fotos enviadas pelo cliente. Utilize sua capacidade de visão para descrever, interpretar e responder às fotos que o cliente mandar.\n`;
    }

    // Discord Notifications Plugue
    const discordPlug = plugs.find((p: any) => p.plug_key === "discord_notifications");
    if (discordPlug) {
      const trigger = discordPlug.config_json?.trigger_instructions || "";
      const tmpl = discordPlug.config_json?.notification_template || "";
      if (trigger && tmpl) {
        sysPrompt += `\n[INTEGRAÇÃO - NOTIFICAÇÃO DISCORD]:\n`;
        sysPrompt += `- REGRA DE DISPARO: ${trigger}\n`;
        sysPrompt += `- AÇÃO EXIGIDA: Quando a regra acima for atingida, você OBRIGATORIAMENTE deve incluir no final da sua resposta a notificação envolvida nas tags XML <DISCORD_NOTIFY> e </DISCORD_NOTIFY>. Preserve as quebras de linha exatas do template!\n`;
        sysPrompt += `- FORMATO DO TEXTO (substitua as variaveis pelos dados reais da conversa):\n<DISCORD_NOTIFY>\n${tmpl}\n</DISCORD_NOTIFY>\n`;
      }
    }

    // Consulting Schedule Plugue
    const consultingPlug = plugs.find((p: any) => p.plug_key === "consulting_schedule");
    if (consultingPlug) {
      const schedulingRules = consultingPlug.config_json?.scheduling_rules || "";
      if (schedulingRules) {
        sysPrompt += `\n[INTEGRAÇÃO - AGENDA DE CONSULTORIA]:\n`;
        sysPrompt += `- REGRAS DE AGENDAMENTO (disponibilidade, horários, dias da semana, duração): ${schedulingRules}\n`;
        
        // Buscar compromissos futuros
        const { data: scheduledEvents } = await supabase
          .from("timeline_events")
          .select("meta_json")
          .eq("tenant_id", tenantId)
          .eq("event_type", "consulting_scheduled")
          .gte("occurred_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
          
        if (scheduledEvents && scheduledEvents.length > 0) {
          const bookedTimes = scheduledEvents
            .map((e: any) => e.meta_json?.scheduled_for)
            .filter(Boolean)
            .join(", ");
          if (bookedTimes) {
            sysPrompt += `- HORÁRIOS JÁ OCUPADOS (INDISPONÍVEIS): ${bookedTimes}\n`;
          }
        } else {
          sysPrompt += `- HORÁRIOS JÁ OCUPADOS (INDISPONÍVEIS): Nenhum.\n`;
        }
        
        sysPrompt += `- AÇÃO EXIGIDA: Sugira horários livres baseando-se nas REGRAS DE AGENDAMENTO e evite rigorosamente os HORÁRIOS JÁ OCUPADOS. Quando o cliente confirmar o horário escolhido, VOCÊ DEVE OBRIGATORIAMENTE incluir no final da sua resposta a tag exata: [AGENDAR_CONSULTORIA: YYYY-MM-DD HH:MM] substituindo pelo dia e hora escolhidos.\n`;
      }
    }

    // Catalog Image Plugue
    const catalogPlug = plugs.find((p: any) => p.plug_key === "catalog_image");
    if (catalogPlug) {
      const imageUrl = catalogPlug.config_json?.image_url;
      const triggerText = catalogPlug.config_json?.trigger_instructions || "Sempre que o cliente pedir o catálogo, portfólio ou cardápio de produtos.";
      if (imageUrl) {
        sysPrompt += `\n[INTEGRAÇÃO - CATÁLOGO/CARDÁPIO]:\n`;
        sysPrompt += `- REGRA DE ENVIO: ${triggerText}\n`;
        sysPrompt += `- AÇÃO EXIGIDA: Quando a regra acima for atendida, você OBRIGATORIAMENTE deve enviar o catálogo/cardápio em formato de imagem. Para isso, inclua EXATAMENTE o texto em Markdown no meio da sua resposta: ![Catálogo/Cardápio](${imageUrl})\n`;
        sysPrompt += `- ATENÇÃO CRÍTICA: Não descreva os itens apenas em texto. Se o assunto for catálogo/cardápio, você DEVE retornar a tag Markdown da imagem acima na sua resposta.\n`;
      }
    }
  }

  const isAudioActive = plugs?.some((p: any) => p.plug_key === "audio_transcription") ?? false;
  const isVisionActive = plugs?.some((p: any) => p.plug_key === "vision_interpretation") ?? false;

  return {
    sysPrompt,
    crmTargetStage,
    crmAssigneeId,
    plugs: plugs || [],
    isAudioActive,
    isVisionActive
  };
}
