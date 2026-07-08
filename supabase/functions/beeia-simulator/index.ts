import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText } from "../_shared/llm.ts";
import { checkTenantAILimits, logAITokenUsage } from "../_shared/billing.ts";

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const body = await req.json();
    const { tenant_id, session_id, message, action, case_id, hours_limit, customer_phone, customer_name } = body;
    const isTrainer = action === "trainer_message";

    if (!tenant_id || (!session_id && !case_id) || (!message && action !== "evaluate_session")) {
      throw new Error("Missing required fields");
    }

    // 2. Fetch System Prompt
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("beeia_configs")
      .select("system_prompt, target_stage")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    let sysPrompt = config?.system_prompt || "Você é a BeeIA, assistente virtual.";

    if (customer_phone) {
      sysPrompt += `\n[DADOS DO LEAD ATUAL]\n- Telefone: ${customer_phone}\n- Nome: ${customer_name || "Não informado"}\n`;
    }

    // 2a. Fetch Learnings
    const { data: learnings, error: lrnErr } = await supabaseAdmin
      .from("beeia_learnings")
      .select("learning_text")
      .eq("tenant_id", tenant_id);
    
    if (!lrnErr && learnings && learnings.length > 0) {
      sysPrompt += "\n\n[REGRAS APRENDIDAS EM TREINAMENTOS ANTERIORES]:\n";
      learnings.forEach((l, i) => {
        sysPrompt += `${i + 1}. ${l.learning_text}\n`;
      });
    }





    // 2b. Check limits
    try {
      await checkTenantAILimits(tenant_id, supabaseAdmin);
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Limite de Tokens do seu plano atingido." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402,
      });
    }

    // 3. Save User Message if not evaluating
    if (action !== "evaluate_session") {
      const isTrainer = action === "trainer_message";
      
      if (session_id) {
        const { error: insErr1 } = await supabaseAdmin
          .from("beeia_simulations")
          .insert({
            tenant_id,
            session_id,
            role: isTrainer ? "system" : "user",
            content: isTrainer ? `[MENSAGEM DO SEU TREINADOR]: ${message}` : message
          });
        if (insErr1) throw insErr1;
      } else if (case_id) {
        // Save as system_note in wa_messages so it appears in chat but doesn't get sent to Z-API
        const { error: insErrCase } = await supabaseAdmin
          .from("wa_messages")
          .insert({
            tenant_id,
            case_id,
            direction: "inbound",
            type: "system_note",
            from_phone: "system",
            to_phone: "system",
            body_text: isTrainer ? `[MENSAGEM DO SEU TREINADOR]: ${message}` : message,
            payload_json: {},
            occurred_at: new Date().toISOString()
          });
        if (insErrCase) throw insErrCase;
      }
    }

    // 4. Fetch History
    let history: { role: string; content: string }[] = [];
    if (session_id) {
      const { data: hist, error: histErr } = await supabaseAdmin
        .from("beeia_simulations")
        .select("role, content")
        .eq("tenant_id", tenant_id)
        .eq("session_id", session_id)
        .order("created_at", { ascending: true })
        .limit(30);
      if (histErr) throw histErr;
      history = (hist ?? []).map(h => ({ role: h.role, content: h.content }));
    } else if (case_id) {
      let q = supabaseAdmin
        .from("wa_messages")
        .select("direction, type, body_text")
        .eq("tenant_id", tenant_id)
        .eq("case_id", case_id);
        
      if (hours_limit) {
        const minDate = new Date(Date.now() - Number(hours_limit) * 60 * 60 * 1000).toISOString();
        q = q.gte("occurred_at", minDate);
      }

      const { data: hist, error: histErr } = await q
        .order("occurred_at", { ascending: true })
        .limit(100); // Increased limit since we rely on time window now
      if (histErr) throw histErr;
      
      history = (hist ?? [])
        .filter(m => (m.type === "text" || m.type === "system_note") && m.body_text)
        .map(h => ({
          role: h.type === "system_note" ? "system" : (h.direction === "inbound" ? "user" : "assistant"),
          content: h.body_text!
        }));
    }

    // 2b. Fetch active Plugs
    const { data: plugs, error: plugsErr } = await supabaseAdmin
      .from("beeia_plugs")
      .select("plug_key, is_enabled, config_json")
      .eq("tenant_id", tenant_id)
      .eq("is_enabled", true);

    let crmTargetStage = config?.target_stage || "morno";
    let crmAssigneeId = null;

    if (!plugsErr && plugs && plugs.length > 0) {
      sysPrompt += "\n\n[INTEGRAÇÕES E RECURSOS DO SISTEMA ATIVOS]:\n";
      
      // 1. CRM Plugue
      const crmPlug = plugs.find(p => p.plug_key === "crm_journeys");
      if (crmPlug) {
        crmTargetStage = crmPlug.config_json?.target_stage || config?.target_stage || "morno";
        crmAssigneeId = crmPlug.config_json?.assigned_user_id || null;
        sysPrompt += `- CRM & Encaminhamento: A IA qualificará os leads interessados e os moverá para a etapa "${crmTargetStage}".\n`;
      }

      // 2. Entidades Catalog Plugue
      const coreEntPlug = plugs.find(p => p.plug_key === "core_entities");
      if (coreEntPlug) {
        const allowedFields = coreEntPlug.config_json?.allowed_fields || [];
        const limitInstructions = coreEntPlug.config_json?.limit_instructions || "";

        let propEntity = null;
        if (case_id) {
          // Query Case Items offering linked to this case
          const { data: propItem } = await supabaseAdmin
            .from("case_items")
            .select("offering_entity_id")
            .eq("case_id", case_id)
            .limit(1)
            .maybeSingle();

          if (propItem?.offering_entity_id) {
            const { data: ent } = await supabaseAdmin
              .from("core_entities")
              .select("*")
              .eq("id", propItem.offering_entity_id)
              .maybeSingle();
            propEntity = ent;
          }
        }

        if (!propEntity) {
          let messagesToScan: string[] = [];
          if (message) messagesToScan.push(message);
          if (history && history.length > 0) {
            const userHistory = history
              .filter(h => h.role === "user" && h.content)
              .map(h => h.content);
            messagesToScan = [...messagesToScan, ...userHistory.reverse()];
          }

          for (const msgToScan of messagesToScan) {
            const words = msgToScan.match(/[a-zA-Z0-9]+/g) || [];
            const cleanWords = words.map(w => w.replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean);
            if (cleanWords.length > 0) {
              const searchTerms = Array.from(new Set([
                ...cleanWords,
                ...cleanWords.map(w => w.toUpperCase()),
                ...cleanWords.map(w => w.toLowerCase())
              ]));
              const { data: matchedEnt } = await supabaseAdmin
                .from("core_entities")
                .select("*")
                .eq("tenant_id", tenant_id)
                .eq("entity_type", "offering")
                .is("deleted_at", null)
                .or(`internal_code.in.(${searchTerms.join(",")}),legacy_id.in.(${searchTerms.join(",")})`)
                .limit(1)
                .maybeSingle();
              
              if (matchedEnt) {
                propEntity = matchedEnt;
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
          if (allowedFields.includes("price") && (meta.price || propEntity.business_type)) {
            sysPrompt += `- Preço: R$ ${meta.price || "Sob consulta"} (${propEntity.business_type === "rent" ? "Locação" : "Venda"})\n`;
          }
          if (allowedFields.includes("description") && meta.description) {
            sysPrompt += `- Descrição Comercial: ${meta.description}\n`;
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
            const { data: photos } = await supabaseAdmin
              .from("core_entity_photos")
              .select("url, room_type")
              .eq("entity_id", propEntity.id)
              .eq("tenant_id", tenant_id)
              .is("deleted_at", null);
            if (photos && photos.length > 0) {
              sysPrompt += `- Fotos oficiais para enviar ao cliente:\n`;
              photos.forEach(ph => {
                sysPrompt += `  * Foto (${ph.room_type || 'Geral'}): ${ph.url}\n`;
              });
            }
          }
        }

        // Load up to 5 other active properties/offerings
        const { data: otherProps } = await supabaseAdmin
          .from("core_entities")
          .select("id, internal_code, display_name, metadata, business_type")
          .eq("tenant_id", tenant_id)
          .eq("entity_type", "offering")
          .eq("status", "active")
          .is("deleted_at", null)
          .neq("id", propEntity?.id || "00000000-0000-0000-0000-000000000000")
          .limit(5);

        if (otherProps && otherProps.length > 0) {
          sysPrompt += `\n[OUTROS IMÓVEIS DISPONÍVEIS NO PORTFÓLIO]:\n`;
          otherProps.forEach(op => {
            const opMeta = op.metadata || {};
            sysPrompt += `- Cód: ${op.internal_code || "N/A"} | ${op.display_name} | Preço: R$ ${opMeta.price || "Sob consulta"} | Negócio: ${op.business_type === "rent" ? "Locação" : "Venda"}\n`;
          });
        }

        if (limitInstructions) {
          sysPrompt += `\n[DIRETRIZES E LIMITES DE INFORMAÇÕES DE IMÓVEIS]:\n${limitInstructions}\n`;
        }
      }

      // 3. Financeiro & Cobrança Plugue
      const finBillingPlug = plugs.find(p => p.plug_key === "financial_billing");
      if (finBillingPlug) {
        const pixKey = finBillingPlug.config_json?.pix_key || "";
        const allowCheckReceivables = finBillingPlug.config_json?.allow_check_receivables ?? false;
        const billingInstructions = finBillingPlug.config_json?.billing_instructions || "";

        sysPrompt += `\n[INTEGRAÇÃO FINANCEIRA - FATURAS E PAGAMENTOS]:\n`;
        if (pixKey) {
          sysPrompt += `- Chave PIX Oficial para Recebimento: "${pixKey}"\n`;
        }

        if (allowCheckReceivables && case_id) {
          // Get customer account entity_id
          const { data: caseWithCust } = await supabaseAdmin
            .from("cases")
            .select("customer_id")
            .eq("id", case_id)
            .maybeSingle();

          if (caseWithCust?.customer_id) {
            const { data: custAcc } = await supabaseAdmin
              .from("customer_accounts")
              .select("entity_id")
              .eq("id", caseWithCust.customer_id)
              .maybeSingle();

            if (custAcc?.entity_id) {
              // Fetch unpaid receivables
              const { data: receivables } = await supabaseAdmin
                .from("financial_receivables")
                .select("description, amount, due_date, status")
                .eq("entity_id", custAcc.entity_id)
                .neq("status", "paid")
                .is("deleted_at", null)
                .order("due_date", { ascending: true });

              if (receivables && receivables.length > 0) {
                sysPrompt += `- Faturas/Recebíveis em Aberto do Cliente Atual:\n`;
                receivables.forEach(r => {
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

      // 4. Simulador de Financiamento Plugue
      const simPlug = plugs.find(p => p.plug_key === "financing_simulator");
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
          const { data: bankRules } = await supabaseAdmin
            .from("financing_bank_rules")
            .select("bank_name, bank_code, base_rate_pct, max_term_months, tac_json, min_loan_value, max_loan_value")
            .eq("tenant_id", tenant_id)
            .eq("is_active", true)
            .is("deleted_at", null);

          if (bankRules && bankRules.length > 0) {
            sysPrompt += `Você está integrado ao Simulador de Financiamento Imobiliário oficial. Use os parâmetros reais de taxas por banco:\n`;
            bankRules.forEach(br => {
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
      // 5. Discord Notifications Plugue
      const discordPlug = plugs.find(p => p.plug_key === "discord_notifications");
      if (discordPlug) {
        const trigger = discordPlug.config_json?.trigger_instructions || "";
        const tmpl = discordPlug.config_json?.notification_template || "";
        if (trigger && tmpl) {
          sysPrompt += `\n[INTEGRAÇÃO - NOTIFICAÇÃO DISCORD]:\n`;
          sysPrompt += `- REGRA DE DISPARO: ${trigger}\n`;
          sysPrompt += `- AÇÃO EXIGIDA: Quando a regra acima for atingida, você OBRIGATORIAMENTE deve incluir no final da sua resposta a tag exata: [DISCORD_NOTIFY: texto da notificacao]\n`;
          sysPrompt += `- FORMATO DO TEXTO (substitua as variaveis pelos dados reais da conversa): ${tmpl}\n`;
        }
      }
    }

    // 5. Prepare LLM Context
    const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    
    if (action === "evaluate_session") {
      // In evaluation mode, we feed the history first, then ask it to evaluate.
      history?.forEach((m) => {
        llmMessages.push({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        });
      });
      llmMessages.push({
        role: "user",
        content: `Aja como um auditor sênior de IA analisando a sua própria performance.
        Aqui estão as regras originais do seu prompt:
        "${sysPrompt}"
        
        Leia a conversa acima e liste 1 acerto claro e 1 erro/ponto de melhoria crítico que você cometeu na sua performance de qualificação comercial, comparado às regras originais. Seja direto, crítico e altamente analítico.`
      });
    } else {
      llmMessages.push({
        role: "system",
        content: `${sysPrompt}\n\n[AMBIENTE DE SIMULAÇÃO] Você está conversando com o administrador do sistema que está testando suas regras. Aja exatamente como agiria com um cliente real. Se for hora de encerrar/qualificar, inclua a tag [STAGE_TRANSITION] no final da sua fala.`
      });
      history?.forEach((m) => {
        llmMessages.push({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        });
      });
      if (action === "trainer_message") {
        llmMessages.push({
          role: "system",
          content: `Responda agora diretamente ao seu treinador/auditor (que mandou a mensagem acima).
REGRAS OBRIGATÓRIAS:
1. Se a mensagem ACIMA do treinador for uma AUTORIZAÇÃO para salvar uma regra (ex: "sim", "pode salvar", "manda bala", "isso mesmo"), VOCÊ NÃO DEVE PERGUNTAR NOVAMENTE. Apenas confirme que salvou e OBRIGATORIAMENTE inclua a tag [SAVE_LEARNING: escreva a regra aqui] no final da sua resposta.
2. Se a mensagem ACIMA do treinador for uma correção nova ou bronca, elabore uma regra curta sobre o que você aprendeu e PERGUNTE textualmente: "Posso salvar no meu aprendizado a seguinte instrução: [sua regra]?".
Siga estas regras rigorosamente.`
        });
      }
    }

    // 6. Generate Response
    const llmRes = await generateText({
      messages: llmMessages,
      fallback: () => "Ocorreu um erro no simulador."
    });

    let responseText = llmRes.text;
    
    // Check for Discord Notifications
    const discordMatch = responseText.match(/\[DISCORD_NOTIFY:\s*([^\]]+)\]/i);
    if (discordMatch && discordMatch[1]) {
      const discordText = discordMatch[1].trim();
      responseText = responseText.replace(/\[DISCORD_NOTIFY:\s*[^\]]+\]/gi, "").trim();
      
      const dp = plugs?.find(p => p.plug_key === "discord_notifications");
      const webhookUrl = dp?.config_json?.webhook_url;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `[TESTE DO SIMULADOR] ${discordText.replace(/\\n/g, '\n')}`,
            username: "BeeIA Notificações",
            avatar_url: "https://github.com/marcelahubpaladio.png"
          })
        }).catch(err => console.error("[BEEIA] Failed to send Discord notification in simulator", err));
      }
    }

    // Check for SAVE_LEARNING tag
    const saveMatch = responseText.match(/\[SAVE_LEARNING:\s*([^\]]+)\]/i);
    if (saveMatch && saveMatch[1]) {
      const learningText = saveMatch[1].trim();
      // Insert into beeia_learnings
      await supabaseAdmin.from("beeia_learnings").insert({
        tenant_id,
        learning_text: learningText
      });
      // Optionally clean the tag from the UI response
      responseText = responseText.replace(/\[SAVE_LEARNING:\s*[^\]]+\]/i, "\n\n*(✅ Aprendizado salvo na sua base de treinamento!)*");
    }

    if (llmRes.tokensUsed > 0) {
      await logAITokenUsage(
        tenant_id, 
        llmRes.tokensUsed, 
        action === "evaluate_session" ? `Auto-Avaliação da Simulação BeeIA` : `Simulador BeeIA`, 
        llmRes.provider, 
        supabaseAdmin, 
        action === "evaluate_session" ? "beeia_simulator_eval" : "beeia_simulator", 
        session_id
      );
    }

    // 7. Save Assistant Response
    if (action !== "evaluate_session") {
      if (session_id) {
        await supabaseAdmin.from("beeia_simulations").insert({
          tenant_id,
          session_id,
          role: "assistant",
          content: responseText
        });
      } else if (case_id) {
        const { error: insErr } = await supabaseAdmin.from("wa_messages").insert({
          tenant_id,
          case_id,
          direction: "inbound", // use inbound so it acts as internal note
          type: "system_note",
          from_phone: "system",
          to_phone: "system",
          body_text: responseText,
          payload_json: {},
          occurred_at: new Date().toISOString()
        });
        if (insErr) throw insErr;
      }
    } else {
      if (session_id) {
        await supabaseAdmin.from("beeia_simulations").insert({
          tenant_id,
          session_id,
          role: "system",
          content: "AUTO-AVALIAÇÃO DA IA: " + responseText
        });
      } else if (case_id) {
        const { error: insErr } = await supabaseAdmin.from("wa_messages").insert({
          tenant_id,
          case_id,
          direction: "inbound", // use inbound so it acts as internal note
          type: "system_note",
          from_phone: "system",
          to_phone: "system",
          body_text: "AUTO-AVALIAÇÃO DA IA: " + responseText,
          payload_json: {},
          occurred_at: new Date().toISOString()
        });
        if (insErr) throw insErr;
      }
    }

    // 8. Return response
    return new Response(JSON.stringify({ 
      ok: true, 
      response: responseText, 
      tokensUsed: llmRes.tokensUsed 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in beeia-simulator:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
