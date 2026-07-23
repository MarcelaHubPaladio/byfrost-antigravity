import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

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
  const fn = "meta-publisher";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const supabase = createSupabaseAdmin();

    // Find pending posts
    const { data: posts, error: fetchErr } = await supabase
      .from("meta_scheduled_posts")
      .select("*, meta_organic_pages(*)")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    if (fetchErr) {
      console.error(`[${fn}] Error fetching posts:`, fetchErr);
      return err("internal_error", 500);
    }

    if (!posts || posts.length === 0) {
      return json({ ok: true, message: "No pending posts to publish" });
    }

    let publishedCount = 0;
    let failedCount = 0;

    for (const post of posts) {
      try {
        const page = post.meta_organic_pages;
        if (!page || !page.access_token_encrypted || !page.page_id) {
          throw new Error("Page access token missing");
        }

        const token = await decryptText(page.access_token_encrypted);

        // Post to Meta API (Graph API)
        const isInstagram = page.platform === "instagram";
        
        let publishRes;
        
        if (isInstagram) {
          // Instagram publishing requires the Instagram Business Account ID, which we store in page_id
          const igUserId = page.page_id;
          
          // 1. Create media container
          let url = `https://graph.facebook.com/v19.0/${igUserId}/media?image_url=${encodeURIComponent(post.media_url)}&caption=${encodeURIComponent(post.message)}&access_token=${token}`;
          let reqMedia = await fetch(url, { method: "POST" });
          let resMedia = await reqMedia.json();
          if (resMedia.error) throw new Error(resMedia.error.message);
          
          // 2. Publish container (with retry for 'Media ID is not available')
          let publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish?creation_id=${resMedia.id}&access_token=${token}`;
          
          let maxRetries = 4;
          for (let i = 0; i < maxRetries; i++) {
            let reqPublish = await fetch(publishUrl, { method: "POST" });
            publishRes = await reqPublish.json();
            
            if (!publishRes.error) {
              break; // Success
            }
            
            // If the error is 'Media ID is not available' (or subcode 2207027), we need to wait and retry
            if (publishRes.error?.message?.includes("Media ID is not available") || publishRes.error?.error_user_msg?.includes("not available")) {
              if (i < maxRetries - 1) {
                // Wait 3 seconds before retrying
                await new Promise(r => setTimeout(r, 3000));
                continue;
              }
            }
            
            throw new Error(publishRes.error.message);
          }
          
        } else {
          // Facebook publishing
          let url = `https://graph.facebook.com/v19.0/${page.page_id}/photos`;
          const formData = new URLSearchParams();
          formData.append("url", post.media_url);
          formData.append("message", post.message);
          formData.append("access_token", token);
          
          let reqF = await fetch(url, { method: "POST", body: formData });
          publishRes = await reqF.json();
          if (publishRes.error) throw new Error(publishRes.error.message);
        }

        // Mark as published
        await supabase
          .from("meta_scheduled_posts")
          .update({ status: "published", remote_post_id: publishRes.id })
          .eq("id", post.id);

        publishedCount++;
      } catch (postError: any) {
        console.error(`[${fn}] Failed to publish post ${post.id}:`, postError);
        
        await supabase
          .from("meta_scheduled_posts")
          .update({ status: "failed", error_message: postError.message })
          .eq("id", post.id);
          
        failedCount++;
      }
    }

    return json({ ok: true, published: publishedCount, failed: failedCount });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
