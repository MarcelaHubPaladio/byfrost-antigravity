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
  const fn = "meta-dm-send";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => null);
    const caseId = body?.case_id;
    const messageText = body?.message_text;

    if (!caseId || !messageText) return err("missing_fields", 400);

    // Fetch case and page
    const { data: theCase, error: caseErr } = await supabase
      .from("cases")
      .select("tenant_id, customer_id, status")
      .eq("id", caseId)
      .single();

    if (caseErr || !theCase) return err("case_not_found", 404);

    // Find the recipient id (the user we are talking to) and the page
    // We can look at the latest meta message for this case
    const { data: lastMsg, error: msgErr } = await supabase
      .from("meta_messages")
      .select("recipient_id, sender_id, meta_organic_page_id")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (msgErr || !lastMsg) return err("no_messages_in_case", 400);

    // If the last message was inbound, the recipient is us (the page), and the sender is the user.
    // If the last message was outbound, the sender is us (the page), and the recipient is the user.
    // To be safe, we just fetch the page details.
    const { data: page, error: pageErr } = await supabase
      .from("meta_organic_pages")
      .select("*")
      .eq("id", lastMsg.meta_organic_page_id)
      .single();

    if (pageErr || !page) return err("page_not_found", 404);

    // Get the user's ID
    const { data: custAcc } = await supabase
      .from("customer_accounts")
      .select("phone_e164")
      .eq("id", theCase.customer_id)
      .single();
      
    if (!custAcc) return err("customer_not_found", 404);
    
    // the phone_e164 is saved as "facebook_{id}" or "instagram_{id}"
    const platform = page.platform;
    const prefix = `${platform}_`;
    if (!custAcc.phone_e164.startsWith(prefix)) {
       return err("invalid_customer_id_format", 400);
    }
    const recipientId = custAcc.phone_e164.substring(prefix.length);
    
    const token = await decryptText(page.access_token_encrypted);
    
    let url = `https://graph.facebook.com/v19.0/${page.page_id}/messages`;
    
    const sendBody = {
       messaging_type: "RESPONSE",
       recipient: { id: recipientId },
       message: { text: messageText }
    };
    
    const reqF = await fetch(url + `?access_token=${token}`, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(sendBody)
    });
    
    const resF = await reqF.json();
    
    if (resF.error) {
       console.error(`[${fn}] API Error:`, resF.error);
       await supabase.from("timeline_events").insert({
           tenant_id: theCase.tenant_id,
           case_id: caseId,
           event_type: "beeia_error",
           actor_type: "system",
           message: "API Error from Facebook: " + JSON.stringify(resF.error)
       });
       return err("api_error", 400, { api_error: resF.error.message });
    }
    
    // Insert outbound message locally
    await supabase.from("meta_messages").insert({
       tenant_id: theCase.tenant_id,
       meta_organic_page_id: page.id,
       case_id: caseId,
       remote_msg_id: resF.message_id || `local-${Date.now()}`,
       sender_id: page.page_id,
       recipient_id: recipientId,
       sender_name: "BeeIA",
       message_text: messageText,
       platform: platform,
       direction: "outbound"
    });

    return json({ ok: true, remote_message_id: resF.message_id });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
