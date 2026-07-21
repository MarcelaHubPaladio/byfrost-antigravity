import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { decryptText, encryptText } from "../_shared/encryption.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createSupabaseAdmin();

  try {
    // 1. Get unique access tokens from meta_ads_accounts (acting as System User Tokens)
    const { data: accounts, error: accErr } = await supabase
      .from("meta_ads_accounts")
      .select("tenant_id, access_token_encrypted")
      .eq("is_active", true);

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return json({ ok: true, message: "No tokens found" });
    }

    // Deduplicate tokens per tenant
    const tokensByTenant = new Map<string, string>();
    for (const acc of accounts) {
      if (!tokensByTenant.has(acc.tenant_id)) {
        tokensByTenant.set(acc.tenant_id, acc.access_token_encrypted);
      }
    }

    const results = [];

    for (const [tenantId, encryptedToken] of tokensByTenant.entries()) {
      try {
        const token = await decryptText(encryptedToken);

        // Fetch Pages from Meta
        const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${token}`;
        const pagesRes = await fetch(pagesUrl);
        const pagesJson = await pagesRes.json();

        if (!pagesRes.ok) {
          console.error(`[meta-organic] Failed to fetch pages for tenant ${tenantId}`, pagesJson);
          results.push({ tenant: tenantId, ok: false, error: pagesJson?.error?.message });
          continue;
        }

        const pages = pagesJson.data || [];
        let postsProcessed = 0;

        for (const page of pages) {
          const pageId = page.id;
          const pageName = page.name;
          const pageToken = page.access_token;
          const encryptedPageToken = await encryptText(pageToken);

          // Upsert FB Page
          const { data: fbPageRow, error: fbPageErr } = await supabase
            .from("meta_organic_pages")
            .upsert({
              tenant_id: tenantId,
              page_id: pageId,
              name: pageName,
              platform: "facebook",
              access_token_encrypted: encryptedPageToken,
              updated_at: new Date().toISOString(),
            }, { onConflict: "tenant_id,page_id" })
            .select("id")
            .single();

          if (!fbPageErr && fbPageRow) {
            // Fetch FB Posts
            // We use published_posts to get organic posts. 
            // Insights requires pages_read_engagement permission.
            const fbPostsUrl = `https://graph.facebook.com/v19.0/${pageId}/published_posts?fields=id,message,permalink_url,created_time,full_picture,shares,likes.summary(true),comments.summary(true)&limit=50&access_token=${pageToken}`;
            const fbPostsRes = await fetch(fbPostsUrl);
            const fbPostsJson = await fbPostsRes.json();

            if (fbPostsRes.ok && fbPostsJson.data) {
              for (const post of fbPostsJson.data) {
                const { data: postRow, error: postErr } = await supabase
                  .from("meta_organic_posts")
                  .upsert({
                    meta_organic_page_id: fbPageRow.id,
                    post_id: post.id,
                    message: post.message || "",
                    picture_url: post.full_picture || "",
                    permalink: post.permalink_url || "",
                    posted_at: post.created_time,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "meta_organic_page_id,post_id" })
                  .select("id")
                  .single();

                if (!postErr && postRow) {
                  const likes = post.likes?.summary?.total_count || 0;
                  const comments = post.comments?.summary?.total_count || 0;
                  const shares = post.shares?.count || 0;

                  await supabase.from("meta_organic_metrics").upsert({
                    meta_organic_post_id: postRow.id,
                    likes,
                    comments,
                    shares,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "meta_organic_post_id" });
                  postsProcessed++;
                }
              }
            }
          }

          // If it has an Instagram Business Account, fetch IG Media
          if (page.instagram_business_account?.id) {
            const igId = page.instagram_business_account.id;
            
            // Upsert IG Page
            const { data: igPageRow, error: igPageErr } = await supabase
              .from("meta_organic_pages")
              .upsert({
                tenant_id: tenantId,
                page_id: igId,
                name: `${pageName} (IG)`,
                platform: "instagram",
                access_token_encrypted: encryptedPageToken, // Uses the page token as well
                updated_at: new Date().toISOString(),
              }, { onConflict: "tenant_id,page_id" })
              .select("id")
              .single();

            if (!igPageErr && igPageRow) {
              // Fetch IG Media
              const igMediaUrl = `https://graph.facebook.com/v19.0/${igId}/media?fields=id,caption,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${pageToken}`;
              const igMediaRes = await fetch(igMediaUrl);
              const igMediaJson = await igMediaRes.json();

              if (igMediaRes.ok && igMediaJson.data) {
                for (const media of igMediaJson.data) {
                  const { data: igPostRow, error: igPostErr } = await supabase
                    .from("meta_organic_posts")
                    .upsert({
                      meta_organic_page_id: igPageRow.id,
                      post_id: media.id,
                      message: media.caption || "",
                      picture_url: media.media_url || "",
                      permalink: media.permalink || "",
                      posted_at: media.timestamp,
                      updated_at: new Date().toISOString(),
                    }, { onConflict: "meta_organic_page_id,post_id" })
                    .select("id")
                    .single();

                  if (!igPostErr && igPostRow) {
                    await supabase.from("meta_organic_metrics").upsert({
                      meta_organic_post_id: igPostRow.id,
                      likes: media.like_count || 0,
                      comments: media.comments_count || 0,
                      shares: 0, // IG API doesn't easily expose shares via basic fields
                      updated_at: new Date().toISOString(),
                    }, { onConflict: "meta_organic_post_id" });
                    postsProcessed++;
                  }
                }
              }
            }
          }
        }
        
        results.push({ tenant: tenantId, ok: true, postsProcessed });

      } catch (e: any) {
        console.error(`[meta-organic] Unhandled error for tenant ${tenantId}`, e);
        results.push({ tenant: tenantId, ok: false, error: e.message });
      }
    }

    return json({ ok: true, results });
  } catch (e: any) {
    console.error("[meta-organic] global error", e);
    return json({ ok: false, error: e.message }, 500);
  }
});
