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
import { AgroForteRenderer } from "@/components/portal/AgroForteRenderer";
import { AGROFORTE_DEFAULT } from "@/components/portal/agroforte-types";
import { PortalBlockRenderer } from "@/components/portal/PortalBlockRenderer";
import { GlobalTypographyStyles } from "@/components/portal/GlobalTypographyStyles";

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

    // ─── AgroForte template detection ───────────────────────────────────────
    if (Array.isArray(content) && content.length > 0 && content[0]?._template === 'agroforte') {
        const agroData = { ...AGROFORTE_DEFAULT, ...content[0] };
        
        const customSectionsMap: Record<string, React.ReactNode> = {};
        
        (agroData.customSections || []).forEach((section: any) => {
            const effectiveSettings = section.settings || {};
            customSectionsMap[section.id] = (
                <section 
                    key={section.id} 
                    className={cn(
                        "relative w-full overflow-hidden transition-all duration-700",
                        effectiveSettings.height === 'fit-screen' ? "min-h-screen" : effectiveSettings.height === 'min-height' ? "min-h-[500px]" : "min-h-0",
                        "flex flex-col",
                        effectiveSettings.htmlTag || ''
                    )}
                    style={{
                        backgroundColor: effectiveSettings.style?.background?.color || effectiveSettings.backgroundColor || 'transparent',
                        backgroundImage: effectiveSettings.style?.background?.image ? `url(${effectiveSettings.style.background.image})` : effectiveSettings.backgroundImage ? `url(${effectiveSettings.backgroundImage})` : 'none',
                        backgroundSize: effectiveSettings.style?.background?.size || effectiveSettings.backgroundSize || 'cover',
                        backgroundPosition: effectiveSettings.style?.background?.position || 'center',
                        backgroundRepeat: effectiveSettings.style?.background?.repeat || 'no-repeat',
                        backgroundAttachment: effectiveSettings.style?.background?.attachment || 'scroll',
                        borderStyle: effectiveSettings.style?.border?.type && effectiveSettings.style?.border?.type !== 'none' ? effectiveSettings.style.border.type : undefined,
                        borderWidth: effectiveSettings.style?.border?.width ? `${effectiveSettings.style.border.width}px` : undefined,
                        borderColor: effectiveSettings.style?.border?.color,
                        borderRadius: effectiveSettings.style?.border?.radius ? `${effectiveSettings.style.border.radius}px` : undefined,
                        paddingTop: effectiveSettings.paddingY ? `${effectiveSettings.paddingY}px` : undefined,
                        paddingBottom: effectiveSettings.paddingY ? `${effectiveSettings.paddingY}px` : undefined,
                        paddingLeft: isMobile ? '16px' : effectiveSettings.paddingX ? `${effectiveSettings.paddingX}px` : '32px',
                        paddingRight: isMobile ? '16px' : effectiveSettings.paddingX ? `${effectiveSettings.paddingX}px` : '32px',
                        justifyContent: effectiveSettings.alignItems === 'middle' ? 'center' : effectiveSettings.alignItems || 'flex-start',
                        alignItems: effectiveSettings.justifyContent || 'stretch',
                        '--section-heading-color': effectiveSettings.typography?.headingColor,
                        '--section-text-color': effectiveSettings.typography?.textColor,
                        '--section-link-color': effectiveSettings.typography?.linkColor,
                        '--section-link-hover-color': effectiveSettings.typography?.linkHoverColor,
                    } as React.CSSProperties}
                >
                    {(effectiveSettings.style?.background?.overlay?.color || effectiveSettings.backgroundOverlay) && (
                        <div className="absolute inset-0 z-0" style={{ backgroundColor: effectiveSettings.style?.background?.overlay?.color || effectiveSettings.backgroundOverlay }}></div>
                    )}
                    <div className="relative z-10">
                        <div 
                            className={cn("mx-auto flex", isMobile ? 'w-full flex-col' : effectiveSettings.contentWidth === 'full' ? 'w-full px-4' : 'w-full px-4', effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : effectiveSettings.columnGap === 'extended' ? 'gap-8' : effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4')}
                            style={{
                                maxWidth: effectiveSettings.contentWidth === 'full' ? undefined : effectiveSettings.widthValue ? `${effectiveSettings.widthValue}px` : '1280px'
                            }}
                        >
                            {section.columns ? (
                                section.columns.map((col: any) => (
                                    <div key={col.id} style={{ width: isMobile ? '100%' : `${col.size}%` }} className="flex flex-col gap-4 relative">
                                        {(col.blocks || []).map((block: any) => (
                                            <PortalBlockRenderer 
                                                key={block.id} 
                                                block={block}
                                                isPremium={isPremium}
                                                isMobile={isMobile}
                                            />
                                        ))}
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col gap-4 w-full">
                                    {(section.blocks || []).map((block: any) => (
                                        <PortalBlockRenderer 
                                            key={block.id} 
                                            block={block}
                                            isPremium={isPremium}
                                            isMobile={isMobile}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            );
        });

        return (
            <div className="portal-global-root">
                <GlobalTypographyStyles data={agroData as any} />
                <AgroForteRenderer data={agroData} customSectionsMap={customSectionsMap} />
            </div>
        );
    }
    // ────────────────────────────────────────────────────────────────────────

    const isCustomTemplate = Array.isArray(content) && content.length > 0 && content[0]?._template === 'custom';
    const sections: Section[] = isCustomTemplate ? (content[0].customSections || []) : 
        (Array.isArray(content) && content.length > 0 && !content[0].blocks && !content[0]._template)
        ? [{ id: 'migrated', settings: { paddingY: '12' }, blocks: content as Block[] }]
        : content as Section[];

    const globalData = isCustomTemplate ? content[0] : null;

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
                "relative transition-all duration-700 portal-global-root",
                isPremium && "lg:pl-[80px]"
            )}>
                <GlobalTypographyStyles data={globalData} />
                {sections.map((section: Section) => {
                    const effectiveSettings = getEffectiveSettings(section.settings, section.mobileSettings, isMobile);
                    return (
                        <section 
                            key={section.id} 
                            id={effectiveSettings.cssId ? effectiveSettings.cssId.replace(/^#/, '') : `section-${section.id}`}
                            className={cn(
                                "relative w-full overflow-hidden transition-all duration-700",
                                effectiveSettings.height === 'fit-screen' ? "min-h-screen" : effectiveSettings.height === 'min-height' ? "min-h-[500px]" : "min-h-0",
                                "flex flex-col",
                                effectiveSettings.htmlTag || '',
                                effectiveSettings.sticky === 'top' && "sticky top-0 z-50",
                                effectiveSettings.sticky === 'bottom' && "sticky bottom-0 z-50",
                                effectiveSettings.animation === 'fade-in' && "animate-in fade-in duration-700",
                                effectiveSettings.animation === 'fade-up' && "animate-in fade-in slide-in-from-bottom-8 duration-700",
                                effectiveSettings.animation === 'zoom-in' && "animate-in zoom-in duration-700"
                            )}
                            style={{
                                backgroundColor: effectiveSettings.style?.background?.color || effectiveSettings.backgroundColor || 'transparent',
                                backgroundImage: effectiveSettings.style?.background?.image ? `url(${effectiveSettings.style.background.image})` : effectiveSettings.backgroundImage ? `url(${effectiveSettings.backgroundImage})` : 'none',
                                backgroundSize: effectiveSettings.style?.background?.size || effectiveSettings.backgroundSize || 'cover',
                                backgroundPosition: effectiveSettings.style?.background?.position || 'center',
                                backgroundRepeat: effectiveSettings.style?.background?.repeat || 'no-repeat',
                                backgroundAttachment: effectiveSettings.style?.background?.attachment || 'scroll',
                                borderStyle: effectiveSettings.style?.border?.type && effectiveSettings.style?.border?.type !== 'none' ? effectiveSettings.style.border.type : undefined,
                                borderWidth: effectiveSettings.style?.border?.width ? `${effectiveSettings.style.border.width}px` : undefined,
                                borderColor: effectiveSettings.style?.border?.color,
                                borderRadius: effectiveSettings.style?.border?.radius ? `${effectiveSettings.style.border.radius}px` : undefined,
                                marginTop: effectiveSettings.marginY ? `${Number(effectiveSettings.marginY) * 4}px` : undefined,
                                marginBottom: effectiveSettings.marginY ? `${Number(effectiveSettings.marginY) * 4}px` : undefined,
                                marginLeft: isMobile ? undefined : effectiveSettings.marginX ? `${Number(effectiveSettings.marginX) * 4}px` : undefined,
                                marginRight: isMobile ? undefined : effectiveSettings.marginX ? `${Number(effectiveSettings.marginX) * 4}px` : undefined,
                                paddingTop: effectiveSettings.paddingY ? `${Number(effectiveSettings.paddingY) * 4}px` : undefined,
                                paddingBottom: effectiveSettings.paddingY ? `${Number(effectiveSettings.paddingY) * 4}px` : undefined,
                                paddingLeft: isMobile ? '16px' : effectiveSettings.paddingX ? `${Number(effectiveSettings.paddingX) * 4}px` : '32px',
                                paddingRight: isMobile ? '16px' : effectiveSettings.paddingX ? `${Number(effectiveSettings.paddingX) * 4}px` : '32px',
                                justifyContent: effectiveSettings.alignItems || 'flex-start',
                                alignItems: effectiveSettings.justifyContent || 'stretch',
                            }}
                        >
                            {(effectiveSettings.style?.background?.overlay?.color || effectiveSettings.backgroundOverlay) && (
                                <div className="absolute inset-0 z-0" style={{ backgroundColor: effectiveSettings.style?.background?.overlay?.color || effectiveSettings.backgroundOverlay }}></div>
                            )}
                            <div 
                                className={cn(
                                    "relative z-10 w-full mx-auto flex",
                                    effectiveSettings.contentWidth === 'full' ? "w-full px-4" : "w-full px-4",
                                    effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : effectiveSettings.columnGap === 'extended' ? 'gap-8' : effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4'
                                )}
                                style={{
                                    maxWidth: effectiveSettings.contentWidth === 'full' ? undefined : effectiveSettings.widthValue ? `${effectiveSettings.widthValue}px` : '1280px',
                                    justifyContent: effectiveSettings.justifyContent === 'center' ? 'center' : effectiveSettings.justifyContent === 'right' ? 'flex-end' : effectiveSettings.justifyContent === 'space-between' ? 'space-between' : effectiveSettings.justifyContent === 'space-around' ? 'space-around' : 'flex-start',
                                    alignItems: effectiveSettings.verticalAlign === 'middle' ? 'center' : effectiveSettings.verticalAlign === 'bottom' ? 'flex-end' : 'stretch',
                                    flexDirection: isMobile ? 'column' : (effectiveSettings.flexDirection || 'row'),
                                    flexWrap: effectiveSettings.flexWrap || 'nowrap'
                                }}
                            >
                                {section.columns ? (
                                    section.columns.map((col: any) => {
                                        const colSettings = col.settings || {};
                                        const colStyleSettings = colSettings.style || {};
                                        return (
                                            <div 
                                                key={col.id} 
                                                id={colSettings.cssId ? colSettings.cssId.replace(/^#/, '') : undefined}
                                                style={{ 
                                                    width: isMobile ? '100%' : `${col.size}%`,
                                                    alignItems: 'stretch',
                                                    backgroundColor: colStyleSettings.background?.color || colSettings.backgroundColor, 
                                                    backgroundImage: colStyleSettings.background?.image ? `url(${colStyleSettings.background.image})` : undefined, 
                                                    backgroundSize: colStyleSettings.background?.size || 'cover', 
                                                    backgroundPosition: colStyleSettings.background?.position || 'center',
                                                    backgroundRepeat: colStyleSettings.background?.repeat || 'no-repeat',
                                                    borderStyle: colStyleSettings.border?.type && colStyleSettings.border?.type !== 'none' ? colStyleSettings.border.type : undefined,
                                                    borderWidth: colStyleSettings.border?.width ? `${colStyleSettings.border.width}px` : undefined,
                                                    borderColor: colStyleSettings.border?.color,
                                                    borderRadius: colStyleSettings.border?.radius ? `${colStyleSettings.border.radius}px` : undefined,
                                                    paddingTop: colSettings.paddingY ? `${Number(colSettings.paddingY) * 4}px` : undefined,
                                                    paddingBottom: colSettings.paddingY ? `${Number(colSettings.paddingY) * 4}px` : undefined,
                                                    paddingLeft: colSettings.paddingX ? `${Number(colSettings.paddingX) * 4}px` : undefined,
                                                    paddingRight: colSettings.paddingX ? `${Number(colSettings.paddingX) * 4}px` : undefined,
                                                }} 
                                                className={cn("flex flex-col gap-4", colSettings.cssClasses || '')}
                                            >
                                            {(col.blocks || []).map((block: any) => (
                                                <PortalBlockRenderer 
                                                    key={block.id} 
                                                    block={block} 
                                                    isPremium={isPremium} 
                                                    isMobile={isMobile}
                                                />
                                            ))}
                                        </div>
                                        );
                                    })
                                ) : (
                                    (section.blocks || []).map((block) => (
                                        <PortalBlockRenderer 
                                            key={block.id} 
                                            block={block} 
                                            isPremium={isPremium} 
                                            isMobile={isMobile}
                                        />
                                    ))
                                )}
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
