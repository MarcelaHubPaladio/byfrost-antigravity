import { cn } from "@/lib/utils";
import useEmblaCarousel from 'embla-carousel-react';
import { Search, ChevronRight, ArrowRight } from "lucide-react";

export function PremiumSlider({ items }: { items: any[] }) {
    const [emblaRef] = useEmblaCarousel({ loop: true });
    
    return (
        <div className="relative overflow-hidden h-[85vh] md:rounded-[48px] md:mx-6 md:mb-6" ref={emblaRef}>
            <div className="flex h-full">
                {(items || []).map((item: any, idx: number) => (
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

export function InfoCards({ items, isMobile }: { items: any[]; isMobile: boolean }) {
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
            {(items || []).map((item: any, idx: number) => (
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

function getEffectiveSettings(desktop: any, mobile: any, isMobile: boolean) {
    if (!isMobile || !mobile || Object.keys(mobile).length === 0) return desktop || {};
    return { ...desktop, ...mobile };
}

export function PortalBlockRenderer({ block, isPremium, isMobile, onRenderInnerBlock, editMode, onUpdateContent }: { block: any; isPremium: boolean; isMobile: boolean; onRenderInnerBlock?: (b: any) => React.ReactNode; editMode?: boolean; onUpdateContent?: (c: any) => void }) {
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
            "relative duration-1000 fill-mode-forwards w-full",
            heightClass,
            alignClass,
            animationClass,
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
            paddingLeft: isMobile ? '16px' : effectiveSettings.paddingX ? `${effectiveSettings.paddingX}px` : undefined,
            paddingRight: isMobile ? '16px' : effectiveSettings.paddingX ? `${effectiveSettings.paddingX}px` : undefined,
            marginTop: effectiveSettings.marginY ? `${effectiveSettings.marginY}px` : undefined,
            marginBottom: effectiveSettings.marginY ? `${effectiveSettings.marginY}px` : undefined,
            marginLeft: effectiveSettings.marginX ? `${effectiveSettings.marginX}px` : undefined,
            marginRight: effectiveSettings.marginX ? `${effectiveSettings.marginX}px` : undefined,
            zIndex: effectiveSettings.style?.advanced?.zIndex ? Number(effectiveSettings.style.advanced.zIndex) : undefined,
        }}
        id={effectiveSettings.style?.advanced?.cssId || undefined}
        >
            {(effectiveSettings.style?.background?.overlay?.color || effectiveSettings.backgroundOverlay) && (
                <div className="absolute inset-0 z-0" style={{ backgroundColor: effectiveSettings.style?.background?.overlay?.color || effectiveSettings.backgroundOverlay }}></div>
            )}
            <div className="relative z-10 w-full h-full">
            {block.type === 'slider' && <PremiumSlider items={block.content?.items || []} />}
            
            {block.type === 'info-cards' && <InfoCards items={block.content?.items || []} isMobile={isMobile} />}

            {block.type === 'hero' && (
                <div className="py-12">
                    <div className={cn(
                        "max-w-4xl",
                        effectiveSettings.textAlign === 'center' || !effectiveSettings.textAlign ? "mx-auto" :
                        effectiveSettings.textAlign === 'right' ? "ml-auto" : "mr-auto"
                    )}>
                        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6" dangerouslySetInnerHTML={{ __html: block.content?.title || 'Título Aqui' }} />
                        <div 
                            className={cn(
                                "text-xl md:text-2xl text-slate-500 max-w-2xl leading-relaxed prose prose-slate dark:prose-invert",
                                effectiveSettings.textAlign === 'center' || !effectiveSettings.textAlign ? "mx-auto" :
                                effectiveSettings.textAlign === 'right' ? "ml-auto" : "mr-auto"
                            )}
                            dangerouslySetInnerHTML={{ __html: block.content?.subtitle || 'Subtítulo aqui...' }}
                        />
                    </div>
                </div>
            )}

            {block.type === 'header' && (
                <header className={cn(
                    "w-full py-6 px-6 md:px-12 flex items-center transition-all bg-white/80 backdrop-blur-md sticky top-0 z-[100] border-b border-slate-100 rounded-[32px] mb-8 shadow-sm",
                    isPremium && "bg-transparent border-none text-white backdrop-blur-none static px-12",
                    block.content?.variant === 'logo-center' && "flex-col gap-6"
                )}>
                    <div className={cn(
                        "flex items-center gap-2",
                        block.content?.variant === 'logo-center' && "w-full justify-center"
                    )}>
                        <span className="text-2xl font-black tracking-tighter">
                            {block.content?.logoText || 'LOGO'}
                        </span>
                    </div>

                    <nav className={cn(
                        "hidden md:flex flex-1 items-center gap-8 mx-auto",
                        block.content?.variant === 'logo-left' && "ml-12",
                        block.content?.variant === 'logo-center' && "justify-center"
                    )}>
                        {(block.content?.links || []).map((link: any, idx: number) => (
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
                        block.content?.variant === 'logo-center' && "hidden"
                    )}>
                    </div>
                </header>
            )}

            {block.type === 'title' && (() => {
                const Tag = (block.content?.htmlTag?.toLowerCase() || 'h2') as keyof JSX.IntrinsicElements;
                const sizeClass = block.content?.size === 'Pequeno' ? 'text-2xl' :
                                  block.content?.size === 'Médio' ? 'text-4xl' :
                                  block.content?.size === 'Grande' ? 'text-6xl md:text-7xl font-extrabold' :
                                  block.content?.size === 'Gigante' ? 'text-7xl md:text-9xl font-black' : 'text-3xl font-bold';
                
                const alignClass = block.content?.alignment === 'center' ? 'text-center' :
                                   block.content?.alignment === 'right' ? 'text-right' :
                                   block.content?.alignment === 'justify' ? 'text-justify' : 'text-left';

                const content = block.content?.title || 'Título Aqui';

                return (
                    <div className={cn("w-full py-4", alignClass)}>
                        {block.content?.link ? (
                            <a href={block.content.link} className="hover:opacity-80 transition-opacity">
                                <Tag className={sizeClass}>{content}</Tag>
                            </a>
                        ) : (
                            <Tag className={sizeClass}>{content}</Tag>
                        )}
                    </div>
                );
            })()}

            {block.type === 'text' && (() => {
                const cols = block.content?.columns && block.content.columns !== 'Padrão' ? Number(block.content.columns) : 1;
                const gap = block.content?.columnGap || 16;
                const alignClass = effectiveSettings.textAlign === 'center' ? 'text-center' :
                                   effectiveSettings.textAlign === 'right' ? 'text-right' : 'text-left';

                return (
                    <div className={cn("w-full py-6", alignClass)}>
                        <div 
                            className={cn(
                                "prose prose-slate dark:prose-invert max-w-none text-lg leading-relaxed",
                                block.content?.dropCap && "first-letter:text-7xl first-letter:font-bold first-letter:text-slate-900 dark:first-letter:text-white first-letter:mr-3 first-letter:float-left first-letter:leading-none"
                            )}
                            style={{ 
                                columnCount: cols > 1 ? cols : undefined, 
                                columnGap: cols > 1 ? `${gap}px` : undefined 
                            }}
                            dangerouslySetInnerHTML={{ __html: block.content?.text || '<p>Digite seu texto aqui...</p>' }}
                        />
                    </div>
                );
            })()}

            {block.type === 'image' && (
                <div className="w-full py-8">
                    {block.content?.url ? (
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
                    ) : (
                        <div className="w-full h-48 bg-slate-100 flex items-center justify-center rounded-2xl text-slate-400">
                            Sem Imagem
                        </div>
                    )}
                </div>
            )}

            {block.type === 'html' && (
                <div className="w-full py-4" dangerouslySetInnerHTML={{ __html: block.content?.html || '<p>HTML Code</p>' }} />
            )}

            {block.type === 'links' && (
                <div className="max-w-xl mx-auto py-12">
                    <div className="flex flex-col gap-4">
                        {(block.content?.items || []).map((item: any, idx: number) => (
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

            {block.type === 'button' && (
                <div className={cn("w-full py-4 flex", 
                    block.content?.alignment === 'center' ? 'justify-center' : 
                    block.content?.alignment === 'right' ? 'justify-end' : 'justify-start'
                )}>
                    <a 
                        href={block.content?.link || '#'} 
                        className={cn(
                            "inline-flex items-center justify-center font-bold rounded-2xl transition-all shadow-md hover:scale-105 active:scale-95",
                            block.content?.size === 'small' ? 'h-9 px-4 text-sm' :
                            block.content?.size === 'large' ? 'h-14 px-8 text-lg' :
                            block.content?.size === 'xlarge' ? 'h-16 px-10 text-xl' :
                            'h-11 px-6 text-base',
                            block.content?.variant === 'info' ? 'bg-blue-600 text-white hover:bg-blue-700' :
                            block.content?.variant === 'success' ? 'bg-green-600 text-white hover:bg-green-700' :
                            block.content?.variant === 'warning' ? 'bg-yellow-500 text-white hover:bg-yellow-600' :
                            block.content?.variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' :
                            'bg-slate-900 text-white hover:bg-slate-800'
                        )}
                    >
                        {block.content?.text || 'Clique Aqui'}
                    </a>
                </div>
            )}

            {block.type === 'video' && (
                <div className="w-full py-8">
                    {block.content?.url ? (
                        <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl bg-black">
                            {block.content.source === 'youtube' ? (
                                <iframe 
                                    src={`https://www.youtube.com/embed/${block.content.url}?autoplay=${block.content.autoplay ? 1 : 0}&controls=${block.content.controls === false ? 0 : 1}&loop=${block.content.loop ? 1 : 0}&mute=${block.content.autoplay ? 1 : 0}`} 
                                    className="absolute top-0 left-0 w-full h-full border-0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                    allowFullScreen
                                />
                            ) : block.content.source === 'vimeo' ? (
                                <iframe 
                                    src={`https://player.vimeo.com/video/${block.content.url}?autoplay=${block.content.autoplay ? 1 : 0}&loop=${block.content.loop ? 1 : 0}&muted=${block.content.autoplay ? 1 : 0}`} 
                                    className="absolute top-0 left-0 w-full h-full border-0"
                                    allow="autoplay; fullscreen; picture-in-picture" 
                                    allowFullScreen
                                />
                            ) : (
                                <video 
                                    src={block.content.url} 
                                    className="absolute top-0 left-0 w-full h-full object-cover"
                                    autoPlay={block.content.autoplay}
                                    controls={block.content.controls !== false}
                                    loop={block.content.loop}
                                    muted={block.content.autoplay}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="w-full aspect-video bg-slate-100 flex items-center justify-center rounded-3xl text-slate-400">
                            Sem Vídeo
                        </div>
                    )}
                </div>
            )}

            {block.type === 'icon' && (
                <div className={cn("w-full py-4 flex", 
                    block.content?.alignment === 'center' ? 'justify-center' : 
                    block.content?.alignment === 'right' ? 'justify-end' : 'justify-start'
                )}>
                    {block.content?.source === 'upload' && block.content?.url ? (
                        <img src={block.content.url} alt="Icon" className="w-12 h-12 object-contain" />
                    ) : (
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-2xl">
                            ★
                        </div>
                    )}
                </div>
            )}

            {block.type === 'grid' && (
                <div className={cn(
                    "grid gap-8 py-8 w-full",
                    block.settings?.direction === 'col' ? "flex flex-col" : (
                        block.content?.columns === 1 || !block.content?.columns ? "grid-cols-1" :
                        block.content?.columns === 2 ? "grid-cols-2" :
                        block.content?.columns === 3 ? "grid-cols-1 md:grid-cols-3" :
                        "grid-cols-1 md:grid-cols-4"
                    ),
                    block.settings?.alignment === 'center' ? (block.settings?.direction === 'col' ? "items-center text-center" : "items-center justify-items-center") :
                    block.settings?.alignment === 'between' ? (block.settings?.direction === 'col' ? "justify-between" : "justify-between") :
                    block.settings?.alignment === 'end' ? (block.settings?.direction === 'col' ? "items-end text-right" : "items-end justify-items-end") : ""
                )}>
                    {(block.blocks || []).map((innerBlock: any) => (
                        onRenderInnerBlock ? onRenderInnerBlock(innerBlock) : (
                            <PortalBlockRenderer 
                                key={innerBlock.id} 
                                block={innerBlock} 
                                isPremium={isPremium} 
                                isMobile={isMobile}
                            />
                        )
                    ))}
                </div>
            )}

            {block.type === 'gallery' && (
                <div className="py-12">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(block.content?.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="aspect-square rounded-[32px] overflow-hidden group relative border border-slate-200">
                                {item.url ? (
                                    <img 
                                        src={item.url} 
                                        alt="" 
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">Imagem</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
