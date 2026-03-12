import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useEmblaCarousel from 'embla-carousel-react';
import { 
    Menu, 
    Search, 
    Instagram, 
    Youtube, 
    Facebook, 
    Twitter, 
    Linkedin,
    ChevronRight,
    ArrowRight
} from "lucide-react";
import { useState, useEffect } from "react";

type BlockType = 'header' | 'hero' | 'text' | 'image' | 'links' | 'divider' | 'html' | 'slider' | 'info-cards';

type Block = {
    id: string;
    type: BlockType;
    content: any;
};

type Section = {
    id: string;
    settings: {
        backgroundImage?: string;
        backgroundSize?: 'cover' | 'contain';
        backgroundColor?: string;
        paddingY?: string;
        paddingX?: string;
        maxWidth?: '1200' | '1400' | 'full';
        columns?: number;
    };
    blocks: Block[];
};

export default function PublicPortal() {
    const { tenantSlug, slug } = useParams();

    const { data: page, isLoading, error } = useQuery({
        queryKey: ["public_portal_page", tenantSlug, slug],
        queryFn: async () => {
            let effectiveTenantSlug = tenantSlug;

            // If tenantSlug is missing (e.g., using /l/:slug route), try to infer it from host
            if (!effectiveTenantSlug) {
                const host = window.location.host;
                // app2.m30.company -> app2.m30
                // localhost:5173 -> null
                if (host.includes('.') && !host.startsWith('localhost')) {
                    effectiveTenantSlug = host.split('.')[0];
                }
            }

            if (!effectiveTenantSlug) {
                // If we still don't have a tenant slug, we try to find the page by slug only
                // but this is risky if slugs overlap across tenants.
                // For now, let's at least try.
                const { data, error: pError } = await supabase
                    .from("portal_pages")
                    .select("*, tenants(slug)")
                    .eq("slug", slug)
                    .eq("is_published", true)
                    .limit(1)
                    .maybeSingle();
                if (pError) throw pError;
                return data;
            }

            const { data: tenant, error: tError } = await supabase
                .from("tenants")
                .select("id")
                .eq("slug", effectiveTenantSlug)
                .single();
            if (tError) {
                // Fallback: try finding by slug alone if tenant slug lookup fails
                const { data, error: pError } = await supabase
                    .from("portal_pages")
                    .select("*")
                    .eq("slug", slug)
                    .eq("is_published", true)
                    .limit(1)
                    .maybeSingle();
                if (pError) throw pError;
                return data;
            }

            const { data, error: pError } = await supabase
                .from("portal_pages")
                .select("*")
                .eq("tenant_id", tenant.id)
                .eq("slug", slug)
                .eq("is_published", true)
                .single();
            if (pError) throw pError;
            return data;
        }
    });

    if (isLoading) return (
        <div className="max-w-4xl mx-auto py-20 px-6 space-y-12">
            <Skeleton className="h-48 w-full rounded-[40px]" />
            <Skeleton className="h-64 w-full rounded-[40px]" />
        </div>
    );

    if (error || !page) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl font-bold mb-4">404</h1>
            <p className="text-slate-500">Página não encontrada ou ainda não publicada.</p>
        </div>
    );

    const isPremium = page.page_settings?.layout === 'sidebar';
    const content = page.content_json || [];
    const sections: Section[] = (Array.isArray(content) && content.length > 0 && !content[0].blocks) 
        ? [{ id: 'migrated', settings: { paddingY: '12' }, blocks: content as Block[] }]
        : content as Section[];

    return (
        <div className={cn(
            "min-h-screen font-sans selection:bg-blue-100 selection:text-blue-900 transition-colors duration-700",
            isPremium ? "bg-[#0a0b10] text-white" : "bg-white dark:bg-slate-950"
        )}>
            {isPremium && (
                <aside className="fixed left-0 top-0 bottom-0 w-[80px] border-r border-white/10 z-[200] hidden lg:flex flex-col items-center py-10 justify-between bg-[#0a0b10]">
                    <div className="flex flex-col items-center gap-12">
                        <button className="text-white/60 hover:text-white transition-colors">
                            <Menu className="h-6 w-6" />
                        </button>
                        <div className="flex flex-col items-center gap-8 -rotate-90 origin-center whitespace-nowrap mt-12">
                             {/* Rotation hack for that vertical label look */}
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-center gap-6 text-white/40">
                        <a href="#" className="hover:text-white transition-colors"><Linkedin className="h-4 w-4" /></a>
                        <a href="#" className="hover:text-white transition-colors"><Youtube className="h-4 w-4" /></a>
                        <a href="#" className="hover:text-white transition-colors"><Instagram className="h-4 w-4" /></a>
                        <a href="#" className="hover:text-white transition-colors"><Facebook className="h-4 w-4" /></a>
                        <a href="#" className="hover:text-white transition-colors"><Twitter className="h-4 w-4" /></a>
                    </div>
                </aside>
            )}

            <main className={cn(
                "relative transition-all duration-700",
                isPremium && "lg:pl-[80px]"
            )}>
                {sections.map((section) => (
                    <section 
                        key={section.id} 
                        className="relative bg-cover bg-center overflow-hidden"
                        style={{
                            backgroundImage: section.settings.backgroundImage ? `url(${section.settings.backgroundImage})` : 'none',
                            backgroundColor: section.settings.backgroundColor || 'transparent',
                            paddingTop: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                            paddingBottom: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                        }}
                    >
                        <div className={cn(
                            "mx-auto",
                            section.settings.maxWidth === 'full' ? "max-w-none px-0" : 
                            section.settings.maxWidth === '1200' ? "max-w-[1200px] px-6" :
                            section.settings.maxWidth === '1400' ? "max-w-[1400px] px-6" :
                            isPremium ? "max-w-[1600px] px-0" : "max-w-7xl px-6"
                        )}>
                            {section.blocks.map((block) => (
                                <div key={block.id} className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                                    {block.type === 'slider' && <PremiumSlider items={block.content.items} />}
                                    
                                    {block.type === 'info-cards' && <InfoCards items={block.content.items} />}

                                    {block.type === 'hero' && (
                                        <div className="py-12 text-center">
                                            <div className="max-w-4xl mx-auto">
                                                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
                                                    {block.content.title}
                                                </h1>
                                                <p className="text-xl md:text-2xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
                                                    {block.content.subtitle}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {block.type === 'header' && (
                                        <header className={cn(
                                            "w-full py-6 px-6 md:px-12 flex items-center transition-all bg-white/80 backdrop-blur-md sticky top-0 z-[100] border-b border-slate-100 rounded-[32px] mb-8 shadow-sm",
                                            isPremium && "bg-transparent border-none text-white backdrop-blur-none static px-12",
                                            block.content.variant === 'logo-center' && "flex-col gap-6"
                                        )}>
                                            <div className={cn(
                                                "flex items-center gap-2",
                                                block.content.variant === 'logo-center' && "w-full justify-center"
                                            )}>
                                                <span className="text-2xl font-black tracking-tighter">
                                                    {block.content.logoText}
                                                </span>
                                            </div>

                                            <nav className={cn(
                                                "hidden md:flex flex-1 items-center gap-8 mx-auto",
                                                block.content.variant === 'logo-left' && "ml-12",
                                                block.content.variant === 'logo-center' && "justify-center"
                                            )}>
                                                {(block.content.links || []).map((link: any, idx: number) => (
                                                    <a 
                                                        key={idx} 
                                                        href={link.url} 
                                                        className={cn(
                                                            "text-sm font-bold transition-colors",
                                                            isPremium ? "text-white/70 hover:text-white" : "text-slate-600 hover:text-slate-900"
                                                        )}
                                                    >
                                                        {link.label}
                                                    </a>
                                                ))}
                                            </nav>

                                            <div className={cn(
                                                "flex items-center gap-8",
                                                block.content.variant === 'logo-center' && "hidden"
                                            )}>
                                                <button className="text-white/80 hover:text-white transition-colors">
                                                    <Search className="h-5 w-5" />
                                                </button>
                                                {block.content.cta?.label && !isPremium && (
                                                    <a 
                                                        href={block.content.cta.url}
                                                        className="h-11 px-6 flex items-center justify-center rounded-2xl bg-slate-900 text-white text-sm font-bold hover:scale-105 transition-transform"
                                                    >
                                                        {block.content.cta.label}
                                                    </a>
                                                )}
                                            </div>
                                        </header>
                                    )}

                                    {block.type === 'text' && (
                                        <div className="max-w-3xl mx-auto py-8 text-center">
                                            <div className="prose prose-slate dark:prose-invert max-w-none text-lg leading-relaxed whitespace-pre-wrap">
                                                {block.content.text}
                                            </div>
                                        </div>
                                    )}

                                    {block.type === 'html' && (
                                        <div className="w-full py-4 text-white" dangerouslySetInnerHTML={{ __html: block.content.html }} />
                                    )}

                                    {block.type === 'links' && (
                                        <div className="max-w-xl mx-auto py-12">
                                            <div className="flex flex-col gap-4">
                                                {block.content.items?.map((item: any, idx: number) => (
                                                    <a 
                                                        key={idx} 
                                                        href={item.url} 
                                                        className={cn(
                                                            "w-full py-5 px-8 rounded-[24px] flex items-center justify-center font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all",
                                                            isPremium ? "bg-white text-[#0a0b10]" : "bg-slate-900 text-white"
                                                        )}
                                                    >
                                                        {item.label}
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
                <footer className="py-12 text-center text-sm text-slate-400">
                    <p>Feito com ❤️ Byfrost</p>
                </footer>
            </main>
        </div>
    );
}

function PremiumSlider({ items }: { items: any[] }) {
    const [emblaRef] = useEmblaCarousel({ loop: true });
    
    return (
        <div className="relative overflow-hidden h-[85vh] md:rounded-[48px] md:mx-6 md:mb-6" ref={emblaRef}>
            <div className="flex h-full">
                {(items || []).map((item, idx) => (
                    <div key={idx} className="flex-[0_0_100%] min-w-0 relative h-full">
                        <img 
                            src={item.image} 
                            className="absolute inset-0 w-full h-full object-cover"
                            alt={item.title}
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b10]/80 via-[#0a0b10]/20 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-center px-12 md:px-24 max-w-5xl">
                            <span className="text-white/60 font-bold tracking-widest text-sm mb-4">0{idx + 1} / 0{items.length}</span>
                            <h2 className="text-6xl md:text-8xl font-black text-white leading-[1.1] mb-8">
                                {item.title}
                            </h2>
                            <p className="text-xl md:text-2xl text-white/60 font-medium">
                                {item.subtitle}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
            
            <button className="absolute right-12 top-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/20 flex items-center justify-center bg-white/5 backdrop-blur-md hover:bg-white/20 transition-all text-white group">
                <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
    );
}

function InfoCards({ items }: { items: any[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 bg-[#0a0b10] border-t border-white/10">
            {/* Explore Now Block */}
            <div className="bg-white text-[#0a0b10] p-12 flex flex-col justify-between min-h-[300px]">
                <h3 className="text-3xl font-black leading-tight">Explore<br/>Now</h3>
                <ChevronRight className="h-8 w-8" />
            </div>
            
            {/* The dynamically added news items */}
            {(items || []).map((item, idx) => (
                <div key={idx} className="border-l border-white/10 p-12 hover:bg-white/5 transition-colors group">
                    <span className="text-xs text-white/40 font-bold mb-6 block uppercase">{item.date}</span>
                    <h4 className="text-lg font-bold text-white/90 group-hover:text-white transition-colors leading-relaxed">
                        {item.text}
                    </h4>
                </div>
            ))}
        </div>
    );
}
