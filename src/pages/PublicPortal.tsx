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

type BlockType = 'header' | 'hero' | 'text' | 'image' | 'links' | 'divider' | 'html' | 'slider' | 'info-cards' | 'grid' | 'gallery';

type Block = {
    id: string;
    type: BlockType;
    content: any;
    blocks?: Block[];
    settings?: {
        height?: 'auto' | 'sm' | 'md' | 'lg' | 'screen';
        textAlign?: 'left' | 'center' | 'right';
        backgroundColor?: string;
        padding?: string;
        direction?: 'row' | 'col';
        alignment?: 'start' | 'center' | 'end' | 'between';
        animation?: 'none' | 'fade-up' | 'zoom-in' | 'fade-left' | 'fade-right';
        imageWidth?: string;
        targetUrl?: string;
    };
    mobileSettings?: any;
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
        height?: 'auto' | 'screen';
        justifyContent?: 'flex-start' | 'center' | 'flex-end';
        alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
    };
    mobileSettings?: any;
    blocks: Block[];
};

function getEffectiveSettings(desktop: any, mobile: any, isMobile: boolean) {
    if (!isMobile || !mobile || Object.keys(mobile).length === 0) return desktop || {};
    return { ...desktop, ...mobile };
}

function BlockRenderer({ block, isPremium, isMobile }: { block: Block; isPremium: boolean; isMobile: boolean }) {
    const effectiveSettings = getEffectiveSettings(block.settings, block.mobileSettings, isMobile);

    const heightClass = effectiveSettings.height === 'sm' ? 'min-h-[200px]' :
                        effectiveSettings.height === 'md' ? 'min-h-[400px]' :
                        effectiveSettings.height === 'lg' ? 'min-h-[600px]' :
                        effectiveSettings.height === 'screen' ? 'min-h-screen' : '';

    const alignClass = effectiveSettings.textAlign === 'center' ? 'text-center' :
                       effectiveSettings.textAlign === 'right' ? 'text-right' : 'text-left';

    const animationClass = effectiveSettings.animation === 'fade-up' ? 'animate-fade-up' :
                          effectiveSettings.animation === 'zoom-in' ? 'animate-zoom-in' :
                          effectiveSettings.animation === 'fade-left' ? 'animate-fade-left' :
                          effectiveSettings.animation === 'fade-right' ? 'animate-fade-right' : '';

    return (
        <div className={cn(
            "duration-1000 fill-mode-forwards",
            heightClass,
            alignClass,
            animationClass
        )}>
            {block.type === 'slider' && <PremiumSlider items={block.content.items} />}
            
            {block.type === 'info-cards' && <InfoCards items={block.content.items} isMobile={isMobile} />}

            {block.type === 'hero' && (
                <div className="py-12">
                    <div className={cn(
                        "max-w-4xl",
                        effectiveSettings.textAlign === 'center' || !effectiveSettings.textAlign ? "mx-auto" :
                        effectiveSettings.textAlign === 'right' ? "ml-auto" : "mr-auto"
                    )}>
                        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
                            {block.content.title}
                        </h1>
                        <div 
                            className={cn(
                                "text-xl md:text-2xl text-slate-500 max-w-2xl leading-relaxed prose prose-slate dark:prose-invert",
                                effectiveSettings.textAlign === 'center' || !effectiveSettings.textAlign ? "mx-auto" :
                                effectiveSettings.textAlign === 'right' ? "ml-auto" : "mr-auto"
                            )}
                            dangerouslySetInnerHTML={{ __html: block.content.subtitle }}
                        />
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
                <div className={cn(
                    "max-w-3xl py-8",
                    block.settings?.textAlign === 'center' ? "mx-auto" :
                    block.settings?.textAlign === 'right' ? "ml-auto" : "mr-auto"
                )}>
                    <div 
                        className="prose prose-slate dark:prose-invert max-w-none text-lg leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: block.content.text }}
                    />
                </div>
            )}

            {block.type === 'image' && block.content.url && (
                <div className="w-full py-8">
                    {block.settings?.targetUrl ? (
                        <a 
                            href={block.settings.targetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={cn(
                                "block transition-transform hover:scale-[1.02] active:scale-[0.98]",
                                block.settings?.textAlign === 'left' ? "mr-auto" : 
                                block.settings?.textAlign === 'right' ? "ml-auto" : "mx-auto"
                            )}
                            style={{ width: `${block.settings?.imageWidth || '100'}%` }}
                        >
                            <div className="relative rounded-[40px] overflow-hidden shadow-2xl">
                                <img src={block.content.url} className="w-full h-auto" alt="" />
                            </div>
                        </a>
                    ) : (
                        <div 
                            className={cn(
                                "relative rounded-[40px] overflow-hidden shadow-2xl transition-all duration-300",
                                block.settings?.textAlign === 'left' ? "mr-auto" : 
                                block.settings?.textAlign === 'right' ? "ml-auto" : "mx-auto"
                            )}
                            style={{ width: `${block.settings?.imageWidth || '100'}%` }}
                        >
                            <img src={block.content.url} className="w-full h-auto" alt="" />
                        </div>
                    )}
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

            {block.type === 'grid' && (
                <div className={cn(
                    "grid gap-8 py-8 w-full",
                    block.settings?.direction === 'col' ? "flex flex-col" : (
                        block.content.columns === 1 || !block.content.columns ? "grid-cols-1" :
                        block.content.columns === 2 ? "grid-cols-2" :
                        block.content.columns === 3 ? "grid-cols-1 md:grid-cols-3" :
                        "grid-cols-1 md:grid-cols-4"
                    ),
                    block.settings?.alignment === 'center' ? (block.settings?.direction === 'col' ? "items-center text-center" : "items-center justify-items-center") :
                    block.settings?.alignment === 'between' ? (block.settings?.direction === 'col' ? "justify-between" : "justify-between") :
                    block.settings?.alignment === 'end' ? (block.settings?.direction === 'col' ? "items-end text-right" : "items-end justify-items-end") : ""
                )}>
                    {(block.blocks || []).map((innerBlock: Block) => (
                        <BlockRenderer 
                            key={innerBlock.id} 
                            block={innerBlock} 
                            isPremium={isPremium} 
                            isMobile={isMobile}
                        />
                    ))}
                </div>
            )}

            {block.type === 'gallery' && (
                <div className="py-12">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(block.content.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="aspect-square rounded-[32px] overflow-hidden group relative border border-white/5">
                                <img 
                                    src={item.url} 
                                    alt="" 
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PublicPortal() {
    const { tenantSlug, slug } = useParams();
    const isMobile = useIsMobile();
    
    const { data: portal, isLoading, error } = useQuery({
        queryKey: ["public_portal_page", tenantSlug, slug],
        queryFn: async () => {
            // 1. Check for Custom Domain first
            const hostname = window.location.hostname;
            const domainSearch = hostname.replace(/^www\./, '');
            const isMainDomain = hostname.includes('localhost') || 
                                hostname.includes('byfrost') || 
                                hostname.includes('m30.company') || 
                                hostname.endsWith('.vercel.app');

            if (!isMainDomain) {
                const { data: customPage } = await supabase
                    .from("portal_pages")
                    .select("*")
                    .or(`page_settings->>custom_domain.eq.${hostname},page_settings->>custom_domain.eq.${domainSearch}`)
                    .eq("is_published", true)
                    .order('created_at', { ascending: false })
                    .maybeSingle();
                
                if (customPage) return customPage;
            }

            let effectiveTenantSlug = tenantSlug;
            let effectiveSlug = slug || 'home';

            if (!effectiveTenantSlug) {
                const host = window.location.host;
                if (host.includes('.') && !host.startsWith('localhost')) {
                    effectiveTenantSlug = host.split('.')[0];
                }
            }

            if (!effectiveTenantSlug) return null;

            const { data: tenant, error: tError } = await supabase
                .from("tenants")
                .select("id")
                .eq("slug", effectiveTenantSlug)
                .single();

            if (tError) {
                const { data, error: pError } = await supabase
                    .from("portal_pages")
                    .select("*")
                    .eq("slug", effectiveSlug)
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
                .eq("slug", effectiveSlug)
                .eq("is_published", true)
                .single();
            if (pError) throw pError;
            return data;
        }
    });

    useEffect(() => {
        if (!portal) return;

        // Title
        if (portal.page_settings?.seo_title) {
            document.title = portal.page_settings.seo_title;
        } else if (portal.title) {
            document.title = portal.title;
        }

        // Favicon
        if (portal.page_settings?.favicon_url) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.getElementsByTagName('head')[0].appendChild(link);
            }
            link.href = portal.page_settings.favicon_url;
        }

        // Meta Description
        if (portal.page_settings?.seo_description) {
            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.setAttribute('name', 'description');
                document.getElementsByTagName('head')[0].appendChild(metaDesc);
            }
            metaDesc.setAttribute('content', portal.page_settings.seo_description);
        }

        // OG Image
        if (portal.page_settings?.og_image_url) {
            let ogImg = document.querySelector('meta[property="og:image"]');
            if (!ogImg) {
                ogImg = document.createElement('meta');
                ogImg.setAttribute('property', 'og:image');
                document.getElementsByTagName('head')[0].appendChild(ogImg);
            }
            ogImg.setAttribute('content', portal.page_settings.og_image_url);
        }
    }, [portal]);

    if (isLoading) return (
        <div className="max-w-4xl mx-auto py-20 px-6 space-y-12">
            <Skeleton className="h-48 w-full rounded-[40px]" />
            <Skeleton className="h-64 w-full rounded-[40px]" />
        </div>
    );

    if (error || !portal) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl font-bold mb-4">404</h1>
            <p className="text-slate-500">Página não encontrada ou ainda não publicada.</p>
        </div>
    );

    const isPremium = portal.page_settings?.layout === 'sidebar';
    const content = portal.content_json || [];
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
                {portal.sections.map((section: Section) => {
                    const effectiveSettings = getEffectiveSettings(section.settings, section.mobileSettings, isMobile);
                    return (
                        <section 
                            key={section.id} 
                            className={cn(
                                "relative w-full overflow-hidden transition-all duration-700",
                                effectiveSettings.height === 'screen' ? "min-h-screen" : "min-h-0",
                                "flex flex-col"
                            )}
                            style={{
                                backgroundImage: effectiveSettings.backgroundImage ? `url(${effectiveSettings.backgroundImage})` : 'none',
                                backgroundColor: effectiveSettings.backgroundColor || 'transparent',
                                backgroundSize: effectiveSettings.backgroundSize || 'cover',
                                backgroundPosition: 'center',
                                paddingTop: `${(Number(effectiveSettings.paddingY) || 0) * 4}px`,
                                paddingBottom: `${(Number(effectiveSettings.paddingY) || 0) * 4}px`,
                                justifyContent: effectiveSettings.alignItems || 'flex-start',
                                alignItems: effectiveSettings.justifyContent || 'stretch',
                            }}
                        >
                            <div className={cn(
                                "relative z-10 w-full px-6 md:px-12 mx-auto",
                                effectiveSettings.maxWidth === '1200' ? "max-w-[1200px]" :
                                effectiveSettings.maxWidth === '1400' ? "max-w-[1400px]" : "max-w-full"
                            )}>
                                {section.blocks.map((block) => (
                                    <BlockRenderer 
                                        key={block.id} 
                                        block={block} 
                                        isPremium={!!portal?.is_premium} 
                                        isMobile={isMobile}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })}
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

function InfoCards({ items, isMobile }: { items: any[]; isMobile: boolean }) {
    return (
        <div className={cn(
            "grid gap-0 bg-[#0a0b10] border-t border-white/10",
            isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"
        )}>
            {/* Explore Now Block */}
            <div className="bg-white text-[#0a0b10] p-12 flex flex-col justify-between min-h-[300px]">
                <h3 className="text-3xl font-black leading-tight">Explore<br/>Now</h3>
                <ChevronRight className="h-8 w-8" />
            </div>
            
            {/* The dynamically added news items */}
            {(items || []).map((item, idx) => (
                <div key={idx} className="border-l border-white/10 p-12 hover:bg-white/5 transition-colors group">
                    <span className="text-xs text-white/40 font-bold mb-6 block uppercase">{item.date}</span>
                    <div 
                        className="text-lg font-bold text-white/90 group-hover:text-white transition-colors leading-relaxed prose prose-invert prose-sm"
                        dangerouslySetInnerHTML={{ __html: item.text }}
                    />
                </div>
            ))}
        </div>
    );
}

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
}
