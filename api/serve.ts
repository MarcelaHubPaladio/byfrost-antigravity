import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const hostname = url.hostname;
  const path = url.pathname;
  
  // 1. Identify domain and slug
  const domainSearch = hostname.replace(/^www\./, '');
  const isMainDomain = hostname.includes('localhost') || 
                      hostname.includes('byfrost') || 
                      hostname.includes('m30.company') || 
                      hostname.endsWith('.vercel.app');

  // If it's a main domain request to root or /api, don't handle it here
  if (isMainDomain && (path === '/' || path.startsWith('/api'))) {
    return fetch(req);
  }

  // 2. Query for the pre-rendered page
  // Priority 1: Exact hostname and path matches slug
  // Priority 2: Domain root (path /) -> default to slug 'home'
  let slug = path.split('/').filter(Boolean)[0] || 'home';
  
  const { data: page, error } = await supabase
    .from('portal_pages')
    .select('published_html, published_css, title, page_settings')
    .or(`page_settings->>custom_domain.eq.${hostname},page_settings->>custom_domain.eq.${domainSearch}`)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!page || !page.published_html) {
    // Fallback back to standard app rendering if no static version exists
    return fetch(req);
  }

  const fullHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.page_settings?.seo_title || page.title}</title>
    <meta name="description" content="${page.page_settings?.seo_description || ''}">
    ${page.page_settings?.favicon_url ? `<link rel="icon" href="${page.page_settings.favicon_url}">` : ''}
    <meta property="og:image" content="${page.page_settings?.og_image_url || ''}">
    <style>
        ${page.published_css || ''}
        body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    ${page.published_html}
    <!-- Powered by Byfrost Static Engine -->
</body>
</html>
  `.trim();

  return new Response(fullHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
