import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { decryptText } from "../_shared/encryption.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...extra }, status);
}

serve(async (req) => {
  const fn = "meta-dms-ingestion";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const supabase = createSupabaseAdmin();

    const { data: pages, error: fetchErr } = await supabase
      .from("meta_organic_pages")
      .select("*");

    if (fetchErr) {
      console.error(`[${fn}] Error fetching pages:`, fetchErr);
      return err("internal_error", 500);
    }

    if (!pages || pages.length === 0) {
      return json({ ok: true, message: "No active pages" });
    }

    const { data: journey } = await supabase
      .from("journeys")
      .select("id")
      .eq("key", "beeia_crm")
      .maybeSingle();

    let processedMessages = 0;
    const debugLogs: any[] = [];
    
    for (const page of pages) {
      try {
        const token = await decryptText(page.access_token_encrypted);
        
        // Fetch conversations
        let url = `https://graph.facebook.com/v19.0/${page.page_id}/conversations?fields=messages{id,message,from,to,created_time}&access_token=${token}`;
        if (page.platform === "instagram") {
           url += "&platform=instagram";
        }
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
           debugLogs.push({ page: page.platform, error: data.error });
           console.error(`[${fn}] API Error for page ${page.page_id}:`, data.error);
           continue;
        }

        debugLogs.push({ page: page.platform, conversationsCount: data.data?.length });
        const conversations = data.data || [];
        
        for (const conv of conversations) {
           const messages = conv.messages?.data || [];
           
           // Sort from oldest to newest to maintain order of insertion
           messages.sort((a: any, b: any) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());

           for (const msg of messages) {
              if (!msg.message) continue; // Skip attachments/system messages for now

              const { data: existing } = await supabase
                .from("meta_messages")
                .select("id")
                .eq("remote_msg_id", msg.id)
                .maybeSingle();

              if (existing) continue;

              const sender = msg.from;
              const recipient = msg.to?.data?.[0] || {};
              
              // Determine direction
              const direction = sender.id === page.page_id ? "outbound" : "inbound";
              
              let caseId = null;

              if (direction === "inbound") {
                 const customerPhoneE164 = `${page.platform}_${sender.id}`;
                 const customerName = sender.name || sender.username || "Unknown Meta User";

                 // Find or create customer
                 let { data: custAcc } = await supabase
                    .from("customer_accounts")
                    .select("id")
                    .eq("tenant_id", page.tenant_id)
                    .eq("phone_e164", customerPhoneE164)
                    .maybeSingle();

                 if (!custAcc) {
                    const { data: newCustAcc } = await supabase
                       .from("customer_accounts")
                       .insert({ tenant_id: page.tenant_id, name: customerName, phone_e164: customerPhoneE164 })
                       .select("id")
                       .single();
                    custAcc = newCustAcc;
                 }

                 // Find or create active case
                 if (custAcc) {
                    let { data: activeCase } = await supabase
                       .from("cases")
                       .select("id")
                       .eq("tenant_id", page.tenant_id)
                       .eq("customer_id", custAcc.id)
                       .eq("status", "open")
                       .maybeSingle();

                    if (!activeCase) {
                        const { data: newCase, error: caseErr } = await supabase
                           .from("cases")
                           .insert({ 
                              tenant_id: page.tenant_id, 
                              customer_id: custAcc.id,
                              status: "open",
                              created_by_channel: "meta",
                              journey_id: journey?.id,
                              is_chat: true,
                              title: "Nova Conversa Meta"
                           })
                           .select("id")
                           .single();

                        if (caseErr) {
                           console.error(`[${fn}] Error creating case:`, caseErr);
                        }
                        activeCase = newCase;
                    }

                    caseId = activeCase?.id;
                 }
              }

              // Insert message
              const { error: insErr } = await supabase
                 .from("meta_messages")
                 .insert({
                    tenant_id: page.tenant_id,
                    meta_organic_page_id: page.id,
                    case_id: caseId,
                    remote_msg_id: msg.id,
                    remote_conversation_id: conv.id,
                    sender_id: sender.id,
                    recipient_id: recipient.id,
                    sender_name: sender.name || sender.username,
                    message_text: msg.message,
                    platform: page.platform,
                    direction,
                    remote_created_at: msg.created_time
                 });

              if (!insErr) {
                 processedMessages++;
                 
                 // If inbound, enqueue AI job
                 if (direction === "inbound" && caseId) {
                    await supabase
                       .from("job_queue")
                       .insert({
                          tenant_id: page.tenant_id,
                          type: "BEEIA_PROCESS_META_MESSAGE",
                          payload_json: { case_id: caseId, meta_message_id: msg.id }
                       });
                 }
              }
           }
        }
      } catch (pageErr: any) {
         debugLogs.push({ page: page.platform, exception: pageErr.message });
         console.error(`[${fn}] Exception processing page ${page.page_id}:`, pageErr);
      }
    }

    return json({ ok: true, processed: processedMessages, debug: debugLogs });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
