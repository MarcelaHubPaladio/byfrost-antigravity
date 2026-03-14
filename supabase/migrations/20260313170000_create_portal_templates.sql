-- Migration: Create Portal Templates
-- Date: 2026-03-13

create table if not exists public.portal_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    thumbnail_url text,
    content_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

-- RLS
alter table public.portal_templates enable row level security;

create policy portal_templates_select_all on public.portal_templates
    for select using (deleted_at is null);

create policy portal_templates_admin_all on public.portal_templates
    for all to authenticated
    using (public.is_super_admin())
    with check (public.is_super_admin());

-- Template: Tecnologia
insert into public.portal_templates (name, description, thumbnail_url, content_json)
values (
    'Tecnologia',
    'Tema focado em automação moderna, com visual escuro, gradientes púrpuras e estética premium.',
    'https://raw.githubusercontent.com/dyad-group/assets/main/templates/tech-preview.png',
    '[
        {
            "id": "header-1",
            "blocks": [
                {
                    "id": "h-b-1",
                    "type": "header",
                    "content": {
                        "cta": { "url": "#", "label": "Começar Agora" },
                        "links": [
                            { "url": "#", "label": "Soluções" },
                            { "url": "#", "label": "Processos" },
                            { "url": "#", "label": "Preços" },
                            { "url": "#", "label": "Blog" }
                        ],
                        "variant": "logo-left",
                        "logoText": "Moon Row"
                    }
                }
            ],
            "settings": {
                "height": "auto",
                "paddingY": "6",
                "maxWidth": "1400",
                "alignItems": "center",
                "backgroundColor": "transparent"
            }
        },
        {
            "id": "hero-1",
            "blocks": [
                {
                    "id": "hero-b-1",
                    "type": "hero",
                    "content": {
                        "title": "Modern Automation for Ambitious Teams.",
                        "subtitle": "Smart automation solutions designed to help high-performing teams work faster, more efficiently, and more creatively."
                    },
                    "settings": { "textAlign": "center", "animation": "fade-up" }
                },
                {
                    "id": "hero-b-img",
                    "type": "image",
                    "content": {
                        "url": "https://raw.githubusercontent.com/dyad-group/assets/main/templates/tech-hero-orb.png"
                    },
                    "settings": { "imageWidth": "80", "textAlign": "center", "animation": "zoom-in" }
                }
            ],
            "settings": {
                "height": "screen",
                "paddingY": "20",
                "maxWidth": "1200",
                "alignItems": "center",
                "justifyContent": "center",
                "backgroundColor": "#0a0b10",
                "backgroundImage": "radial-gradient(circle at 50% 50%, rgba(123, 31, 162, 0.15) 0%, transparent 70%)"
            }
        },
        {
            "id": "features-1",
            "blocks": [
                {
                    "id": "feat-h",
                    "type": "text",
                    "content": {
                        "text": "<h2 class=\"text-4xl font-bold mb-12 text-center\">We help businesses work smarter, scale faster, and innovate with precision through AI.</h2>"
                    }
                },
                {
                    "id": "feat-grid",
                    "type": "grid",
                    "content": { "columns": 4 },
                    "blocks": [
                        { "id": "f1", "type": "info-cards", "content": { "items": [{ "title": "Goodbye to Manual Work", "text": "Our intelligent algorithms handle your repetitive tasks with smart automation." }] } },
                        { "id": "f2", "type": "info-cards", "content": { "items": [{ "title": "AI Tech Insights", "text": "Get deep analytics and actionable insights from your business data." }] } },
                        { "id": "f3", "type": "info-cards", "content": { "items": [{ "title": "Live Insights", "text": "Monitor your automation pipeline in real-time with beautiful dashboards." }] } },
                        { "id": "f4", "type": "info-cards", "content": { "items": [{ "title": "Scalable Infrastructure", "text": "Cloud-native solutions that grow with your business needs." }] } }
                    ]
                }
            ],
            "settings": {
                "paddingY": "24",
                "maxWidth": "1400",
                "backgroundColor": "#0a0b10"
            }
        },
        {
            "id": "stats-1",
            "blocks": [
                {
                    "id": "stats-b",
                    "type": "text",
                    "content": {
                        "text": "<div class=\"text-center\"><span class=\"text-9xl font-black text-white\">10x</span><p class=\"text-2xl text-white/60\">Faster efficiency and deployment cycles.</p></div>"
                    },
                    "settings": { "animation": "fade-up" }
                }
            ],
            "settings": {
                "paddingY": "32",
                "backgroundColor": "#0a0b10",
                "backgroundImage": "linear-gradient(to bottom, #0a0b10, #1a0b30, #0a0b10)"
            }
        },
        {
            "id": "footer-1",
            "blocks": [
                {
                    "id": "foot-b",
                    "type": "html",
                    "content": {
                        "html": "<div class=\"grid grid-cols-4 gap-12 py-12 border-t border-white/10\"><div class=\"col-span-1\"><h3 class=\"font-bold mb-4\">Moon Row</h3><p class=\"text-sm text-white/40\">The future of automation is here.</p></div><div><h4 class=\"font-bold mb-4 uppercase text-xs tracking-widest opacity-40\">Product</h4><ul class=\"space-y-2 text-sm\"><li>Home</li><li>Blog</li><li>Pricing</li></ul></div><div><h4 class=\"font-bold mb-4 uppercase text-xs tracking-widest opacity-40\">Company</h4><ul class=\"space-y-2 text-sm\"><li>Contact</li><li>Press</li><li>Privacy</li></ul></div></div>"
                    }
                }
            ],
            "settings": {
                "paddingY": "12",
                "maxWidth": "1400",
                "backgroundColor": "#0a0b10"
            }
        }
    ]'::jsonb
);
