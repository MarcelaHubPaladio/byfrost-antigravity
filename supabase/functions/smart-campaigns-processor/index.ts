import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

serve(async (req) => {
  const fn = "smart-campaigns-processor";
  
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const supabase = createSupabaseAdmin();
    
    // 1. Fetch campaigns that are in 'processing' status
    const { data: campaigns, error: campErr } = await supabase
      .from("smart_campaigns")
      .select("*")
      .eq("status", "processing");

    if (campErr) {
      throw new Error(`Failed to fetch campaigns: ${campErr.message}`);
    }

    let processedCount = 0;
    
    for (const campaign of (campaigns || [])) {
      const config = campaign.audience_config_json?.rate_limit || { qty: 1, interval_mins: 1 };
      const qty = Number(config.qty) || 1;
      const intervalMins = Number(config.interval_mins) || 1;
      
      // Calculate the time threshold
      const timeThreshold = new Date(Date.now() - intervalMins * 60000).toISOString();
      
      // 2. Count how many recipients were processed (sent or error) in the last `interval_mins`
      const { count: recentSentCount, error: countErr } = await supabase
        .from("smart_campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["sent", "error"])
        .gte("updated_at", timeThreshold);
        
      if (countErr) {
        console.error(`[${fn}] Error counting recent sends for campaign ${campaign.id}:`, countErr);
        continue;
      }
      
      const toSend = qty - (recentSentCount || 0);
      
      if (toSend > 0) {
        // Fetch up to `toSend` pending recipients
        const { data: pendingRecipients, error: pendingErr } = await supabase
          .from("smart_campaign_recipients")
          .select("*")
          .eq("campaign_id", campaign.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(toSend);
          
        if (pendingErr) {
          console.error(`[${fn}] Error fetching pending recipients for ${campaign.id}:`, pendingErr);
          continue;
        }
        
        if (pendingRecipients && pendingRecipients.length > 0) {
          // Prepare attachment if any
          const attachments = Array.isArray(campaign.attachments_json) ? campaign.attachments_json : [];
          const imageAttachment = attachments.find((a: any) => a.type === "image");
          
          for (const recipient of pendingRecipients) {
            // Process message variables
            let msgText = campaign.message_template || "";
            const vars = recipient.variables_json || {};
            for (const key in vars) {
               msgText = msgText.replace(new RegExp(`{{${key}}}`, "g"), vars[key]);
            }
            
            // Call integrations-zapi-send
            const zapiSendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-zapi-send`;
            const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
            
            const payload = {
              tenantId: campaign.tenant_id,
              instanceId: campaign.wa_instance_id,
              to: recipient.phone_e164,
              type: imageAttachment ? "image" : "text",
              text: msgText,
              mediaUrl: imageAttachment ? imageAttachment.url : null,
              correlationId: `campaign:${campaign.id}:recipient:${recipient.id}`
            };
            
            try {
              const res = await fetch(zapiSendUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`
                },
                body: JSON.stringify(payload)
              });
              
              const resData = await res.json().catch(() => null);
              
              // Update recipient status
              const newStatus = resData?.ok ? "sent" : "error";
              
              await supabase
                .from("smart_campaign_recipients")
                .update({ 
                  status: newStatus, 
                  log_json: { res: resData, timestamp: new Date().toISOString() },
                  sent_at: newStatus === "sent" ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString()
                })
                .eq("id", recipient.id);
                
              processedCount++;
            } catch (err: any) {
              await supabase
                .from("smart_campaign_recipients")
                .update({ 
                  status: "error", 
                  log_json: { error: err.message },
                  updated_at: new Date().toISOString()
                })
                .eq("id", recipient.id);
            }
          }
        }
        
        // 3. Check if there are any pending left. If none, complete the campaign.
        const { count: leftPending, error: checkErr } = await supabase
          .from("smart_campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending");
          
        if (!checkErr && leftPending === 0) {
          await supabase
            .from("smart_campaigns")
            .update({ status: "completed" })
            .eq("id", campaign.id);
        }
      }
    }
    
    return new Response(JSON.stringify({ ok: true, processedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error: any) {
    console.error(`[${fn}] Unhandled error:`, error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
