import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
    ChevronLeft, 
    Save, 
    Plus, 
    Type, 
    Image as ImageIcon, 
    Link as LinkIcon, 
    Layout,
    Trash2,
    GripVertical,
    Eye,
    Monitor,
    Smartphone,
    Globe,
    Folder
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
    Settings,
    Maximize,
    AlignCenter,
    StretchHorizontal,
    AlignLeft
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/portal/ImageUpload";
import { Slider } from "@/components/ui/slider";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AgroForteEditor } from "@/components/portal/AgroForteEditor";
import { AgroForteRenderer } from "@/components/portal/AgroForteRenderer";
import { PortalBlockRenderer } from "@/components/portal/PortalBlockRenderer";
import { FixedSectionLayoutEditor } from "@/components/portal/FixedSectionLayoutEditor";
import { BlockPropertiesPanel } from "@/components/portal/BlockPropertiesPanel";
import { SectionPropertiesPanel } from "@/components/portal/SectionPropertiesPanel";
import { AGROFORTE_DEFAULT, type AgroForteData } from "@/components/portal/agroforte-types";
import { useTenant } from "@/providers/TenantProvider";
import { 
    DndContext, 
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    useDraggable,
    useDroppable,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
    defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type BlockType = 'header' | 'hero' | 'text' | 'title' | 'image' | 'links' | 'divider' | 'html' | 'slider' | 'info-cards' | 'grid' | 'gallery';

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
    mobileSettings?: Block['settings'];
};

type PageSettings = {
    layout?: 'default' | 'sidebar';
    sidebarLogo?: string;
    socialLinks?: { type: string, url: string }[];
    seo_title?: string;
    seo_description?: string;
    favicon_url?: string;
    og_image_url?: string;
};

type Column = {
    id: string;
    size: number;
    blocks: Block[];
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
    mobileSettings?: Partial<Section['settings']>;
    blocks?: Block[];
    columns?: Column[];
};

const getEffectiveSettings = (settings: any, mobileSettings: any, mode: 'desktop' | 'mobile') => {
    if (mode === 'mobile' && mobileSettings) {
        return { ...(settings || {}), ...mobileSettings };
    }
    return settings || {};
};

export default function PortalEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sections, setSections] = useState<Section[]>([]);
    const [agroforteData, setAgroforteData] = useState<AgroForteData | null>(null);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [activeElementId, setActiveElementId] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeSettingsTarget, setActiveSettingsTarget] = useState<{type: 'section' | 'block' | 'fixed_section', id: string, blockId?: string} | null>(null);
    const [activeData, setActiveData] = useState<any>(null);
    const [isAddingSection, setIsAddingSection] = useState(false);
    const [activeColumnId, setActiveColumnId] = useState<{sectionId: string, colId: string} | null>(null);

    const layoutOrder = React.useMemo(() => {
        if (agroforteData?.layoutOrder) return agroforteData.layoutOrder;
        
        if (agroforteData) {
            const base = ['nav', 'hero', 'catalogs_categories', 'featured_products', 'catalogs_lists', 'about', 'cta', 'custom', 'footer'];
            const customIds = sections.map(s => s.id);
            const result: string[] = [];
            base.forEach(id => {
                if (id === 'custom') result.push(...customIds);
                else result.push(id);
            });
            return result;
        }
        
        return sections.map(s => s.id);
    }, [agroforteData, sections]);


    const { activeTenant } = useTenant();
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const { data: page, isLoading } = useQuery({
        queryKey: ["portal_page", id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("portal_pages")
                .select("*")
                .eq("id", id)
                .eq("tenant_id", activeTenant?.id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!id,
    });

    useEffect(() => {
        if (page?.content_json) {
            const content = page.content_json;
            if (Array.isArray(content) && content.length > 0 && content[0]?._template === 'agroforte') {
                setAgroforteData({ ...AGROFORTE_DEFAULT, ...content[0] });
                setSections(content[0].customSections || []);
                return;
            }
            setAgroforteData(null);
            // Migration for old structure if necessary
            if (Array.isArray(content) && content.length > 0 && !content[0].blocks) {
                setSections([{
                    id: 'default-section',
                    settings: { paddingY: '12' },
                    blocks: content as Block[]
                }]);
            } else {
                setSections(content as Section[]);
            }
        }
    }, [page]);

    const saveM = useMutation({
        mutationFn: async (payload: any) => {
            const { error } = await supabase
                .from("portal_pages")
                .update(payload)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portal_page", id] });
            toast.success("Página salva com sucesso!");
        },
        onError: (err: any) => {
            toast.error(err.message || "Erro ao salvar");
        }
    });

    const addSectionWithStructure = (structure: number[]) => {
        const newSection: Section = {
            id: Math.random().toString(36).substr(2, 9),
            settings: { paddingY: '12', maxWidth: '1400' },
            columns: structure.map(size => ({
                id: Math.random().toString(36).substr(2, 9),
                size,
                blocks: []
            })),
            blocks: [] // Legacy fallback empty
        };
        setSections([...sections, newSection]);
        setAgroforteData(prev => {
            if (!prev) return prev;
            const currentOrder = prev.layoutOrder || layoutOrder;
            let newOrder = [...currentOrder];
            const footerIdx = newOrder.indexOf('footer');
            if (footerIdx !== -1) {
                newOrder.splice(footerIdx, 0, newSection.id);
            } else {
                newOrder.push(newSection.id);
            }
            return { ...prev, layoutOrder: newOrder };
        });
    };

    const addBlock = (sectionId: string, type: BlockType, colId?: string) => {
        let content = {};
        if (type === 'header') content = { 
            variant: 'logo-left', 
            logoText: page?.title || 'Byfrost',
            links: [{ label: 'Início', url: '#' }, { label: 'Sobre', url: '#' }],
            cta: { label: 'Contato', url: '#' }
        };
        if (type === 'hero') content = { title: 'Bem-vindo', subtitle: 'Subtítulo aqui' };
        if (type === 'text') content = { text: 'Seu texto aqui...' };
        if (type === 'links') content = { items: [{ label: 'Botão 1', url: '#' }] };
        if (type === 'html') content = { html: '<div class="p-4 bg-slate-100 rounded-xl">Custom HTML</div>' };
        if (type === 'slider') content = { items: [{ title: 'Slide 1', subtitle: 'Subtítulo', image: '' }] };
        if (type === 'info-cards') content = { items: [{ title: 'Explore', date: 'Hoje', text: 'Descrição curta...', image: '' }] };
        if (type === 'grid') content = { columns: 2 };
        if (type === 'gallery') content = { items: [] };

        const newBlock: Block = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            content
        };
        
        setSections(sections.map(s => {
            if (s.id !== sectionId) return s;
            if (colId && s.columns) {
                return {
                    ...s,
                    columns: s.columns.map(c => c.id === colId ? { ...c, blocks: [...c.blocks, newBlock] } : c)
                };
            }
            // Fallback for legacy sections
            return { ...s, blocks: [...(s.blocks || []), newBlock] };
        }));
    };

    const removeSection = (sectionId: string) => {
        setSections(sections.filter(s => s.id !== sectionId));
        setAgroforteData(prev => {
            if (!prev) return prev;
            const currentOrder = prev.layoutOrder || layoutOrder;
            return { ...prev, layoutOrder: currentOrder.filter(id => id !== sectionId) };
        });
        if (activeSettingsTarget?.id === sectionId) setActiveSettingsTarget(null);
    };

    const removeBlock = (sectionId: string, blockId: string) => {
        setSections(sections.map(s => {
            if (s.id !== sectionId) return s;
            if (s.columns) {
                return {
                    ...s,
                    columns: s.columns.map(c => ({
                        ...c,
                        blocks: c.blocks.filter(b => b.id !== blockId)
                    }))
                };
            }
            return { ...s, blocks: (s.blocks || []).filter(b => b.id !== blockId) };
        }));
    };

    const updateBlock = (sectionId: string, blockId: string, updates: any) => {
        setSections(sections.map(s => {
            if (s.id !== sectionId) return s;

            const processBlock = (b: Block) => {
                if (b.id !== blockId) return b;
                const { settings, blocks, ...contentUpdates } = updates;
                let updatedBlock = { ...b };
                
                if (settings) {
                    if (previewMode === 'mobile') {
                        updatedBlock.mobileSettings = { ...(updatedBlock.mobileSettings || {}), ...settings };
                    } else {
                        updatedBlock.settings = { ...(updatedBlock.settings || {}), ...settings };
                    }
                }
                if (blocks) updatedBlock.blocks = blocks;
                if (Object.keys(contentUpdates).length > 0) {
                    updatedBlock.content = { ...(updatedBlock.content || {}), ...contentUpdates };
                }
                return updatedBlock;
            };

            if (s.columns) {
                return {
                    ...s,
                    columns: s.columns.map(c => ({
                        ...c,
                        blocks: c.blocks.map(processBlock)
                    }))
                };
            }
            return { ...s, blocks: (s.blocks || []).map(processBlock) };
        }));
    };

    const updateSectionSettings = (sectionId: string, settings: Partial<Section['settings']>) => {
        setSections(sections.map(s => s.id === sectionId ? { 
            ...s, 
            settings: previewMode === 'mobile' ? s.settings : { ...s.settings, ...settings },
            mobileSettings: previewMode === 'mobile' ? { ...(s.mobileSettings || {}), ...settings } : s.mobileSettings
        } : s));
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveData(event.active.data.current);
    };

    const findContainer = (id: string) => {
        if (id.startsWith('empty-col-')) {
            const parts = id.split('-');
            const sectionId = parts[2];
            const colId = parts.slice(3).join('-'); // in case colId has hyphens
            const section = sections.find(s => s.id === sectionId);
            if (section) {
                const col = section.columns?.find(c => c.id === colId);
                if (col) return { section, col, isBlock: false };
            }
            return null;
        }

        const section = sections.find(s => s.id === id);
        if (section) return { section, col: null, isBlock: false };

        for (const s of sections) {
            if (s.blocks?.some(b => b.id === id)) {
                return { section: s, col: null, isBlock: true, block: s.blocks.find(b => b.id === id) };
            }
            if (s.columns) {
                for (const c of s.columns) {
                    if (c.blocks?.some(b => b.id === id)) {
                        return { section: s, col: c, isBlock: true, block: c.blocks.find(b => b.id === id) };
                    }
                }
            }
        }
        return null;
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        const activeItem = findContainer(activeId);
        const overItem = findContainer(overId);

        if (!activeItem || !overItem) return;

        // If dragging sidebar block into a section, wait for DragEnd
        if (active.data.current?.type === 'new-block') return;

        // If dragging a section (reordering sections)
        if (!activeItem.isBlock && !overItem.isBlock) return;

        // Both must be blocks to swap between lists in handleDragOver
        if (!activeItem.isBlock) return;

        const activeSectionId = activeItem.section.id;
        const overSectionId = overItem.section.id;
        const activeColId = activeItem.col?.id;
        const overColId = overItem.col?.id;

        if (activeSectionId === overSectionId && activeColId === overColId) {
            return; // Same container, handle in DragEnd
        }

        setSections(prev => {
            const newSections = JSON.parse(JSON.stringify(prev)); // Deep clone for safety
            
            const getBlocksList = (sections: any[], sectionId: string, colId?: string) => {
                const sec = sections.find((s: any) => s.id === sectionId);
                if (!sec) return null;
                if (colId && sec.columns) {
                    const col = sec.columns.find((c: any) => c.id === colId);
                    if (!col) return null;
                    if (!col.blocks) col.blocks = [];
                    return col.blocks;
                }
                if (!sec.blocks) sec.blocks = [];
                return sec.blocks;
            };

            const activeList = getBlocksList(newSections, activeSectionId, activeColId);
            const overList = getBlocksList(newSections, overSectionId, overColId);

            if (!activeList || !overList) return prev;

            const activeBlockIndex = activeList.findIndex((b: any) => b.id === activeId);
            if (activeBlockIndex === -1) return prev;
            
            let overBlockIndex = overList.findIndex((b: any) => b.id === overId);
            
            let newIndex;
            if (overId.startsWith('empty-col-')) {
                newIndex = 0;
            } else {
                const isBelowOverItem =
                    over &&
                    active.rect.current.translated &&
                    active.rect.current.translated.top >
                    over.rect.top + over.rect.height;
                const modifier = isBelowOverItem ? 1 : 0;
                newIndex = overBlockIndex >= 0 ? overBlockIndex + modifier : overList.length + 1;
            }

            const [movedBlock] = activeList.splice(activeBlockIndex, 1);
            overList.splice(newIndex, 0, movedBlock);

            return newSections;
        });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveData(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Case 1: Dragging Sidebar Item to Section/Column
        if (active.data.current?.type === 'new-block') {
            const blockType = active.data.current.blockType;
            const overItem = findContainer(overId);
            
            if (overItem) {
                // Initialize default content
                let content = {};
                if (blockType === 'header') content = { variant: 'logo-left', logoText: page?.title || 'Byfrost', links: [], cta: { label: 'CTA', url: '#' } };
                if (blockType === 'hero') content = { title: 'Destaque', subtitle: 'Complemento' };
                if (blockType === 'title') content = { title: 'Adicione o texto do seu título aqui', link: '', size: 'Padrão', htmlTag: 'H2', alignment: 'center' };
                if (blockType === 'text') content = { text: 'Conteúdo de texto', dropCap: false, columns: 'Padrão', columnGap: 16 };
                if (blockType === 'grid') content = { columns: 2 };
                if (blockType === 'gallery') content = { items: [] };

                const newBlock: Block = {
                    id: Math.random().toString(36).substr(2, 9),
                    type: blockType,
                    content
                };

                setSections(prev => {
                    const newSections = JSON.parse(JSON.stringify(prev));
                    const sec = newSections.find((s: any) => s.id === overItem.section.id);
                    if (!sec) return prev;

                    let targetList;
                    if (overItem.col) {
                        const col = sec.columns?.find((c: any) => c.id === overItem.col.id);
                        if (col) {
                            if (!col.blocks) col.blocks = [];
                            targetList = col.blocks;
                        }
                    } else {
                        if (!sec.blocks) sec.blocks = [];
                        targetList = sec.blocks;
                    }

                    if (targetList) {
                        if (overId.startsWith('empty-col-')) {
                            targetList.push(newBlock);
                        } else {
                            const overBlockIndex = targetList.findIndex((b: any) => b.id === overId);
                            if (overBlockIndex >= 0) {
                                targetList.splice(overBlockIndex, 0, newBlock);
                            } else {
                                targetList.push(newBlock);
                            }
                        }
                    }
                    return newSections;
                });
            }
            return;
        }

        const activeItem = findContainer(activeId);
        const overItem = findContainer(overId);

        if (!activeItem || !overItem) return;

        // Case 2: Reordering Sections
        if (!activeItem.isBlock && !overItem.isBlock) {
            const activeSectionIndex = sections.findIndex(s => s.id === activeId);
            const overSectionIndex = sections.findIndex(s => s.id === overId);
            if (activeSectionIndex !== -1 && overSectionIndex !== -1 && activeId !== overId) {
                setSections(items => arrayMove(items, activeSectionIndex, overSectionIndex));
            }
            return;
        }

        // Case 3: Reordering Blocks within SAME container (handleDragOver handles different containers)
        if (activeItem.isBlock) {
            const activeSectionId = activeItem.section.id;
            const overSectionId = overItem.section.id;
            const activeColId = activeItem.col?.id;
            const overColId = overItem.col?.id;

            if (activeSectionId === overSectionId && activeColId === overColId) {
                setSections(prev => {
                    const newSections = JSON.parse(JSON.stringify(prev));
                    const sec = newSections.find((s: any) => s.id === activeSectionId);
                    if (!sec) return prev;

                    let targetList;
                    if (activeColId) {
                        const col = sec.columns?.find((c: any) => c.id === activeColId);
                        if (col) targetList = col.blocks;
                    } else {
                        targetList = sec.blocks;
                    }

                    if (targetList) {
                        const activeBlockIndex = targetList.findIndex((b: any) => b.id === activeId);
                        const overBlockIndex = targetList.findIndex((b: any) => b.id === overId);
                        if (activeBlockIndex !== -1 && overBlockIndex !== -1 && activeBlockIndex !== overBlockIndex) {
                            const newArray = arrayMove(targetList, activeBlockIndex, overBlockIndex);
                            if (activeColId) {
                                sec.columns.find((c: any) => c.id === activeColId).blocks = newArray;
                            } else {
                                sec.blocks = newArray;
                            }
                        }
                    }
                    return newSections;
                });
            }
        }
    };

    const handleSave = () => {
        const payload = agroforteData
            ? [agroforteData]
            : sections;
        saveM.mutate({
            content_json: payload,
            updated_at: new Date().toISOString(),
        });
    };

    const handleAgroforteSave = (data: AgroForteData | null) => {
        if (!data) return;
        setAgroforteData(data);
        saveM.mutate({
            content_json: [{ ...data, customSections: sections }],
            updated_at: new Date().toISOString(),
        });
    };

    const publishM = useMutation({
        mutationFn: async () => {
            // 1. Capture HTML from the stage
            const stage = document.getElementById('editor-stage');
            if (!stage) throw new Error("Stage not found");

            // Clone to sanitize and optimize
            const clone = stage.cloneNode(true) as HTMLElement;
            
            // Remove editor-only elements (buttons, drag handles, settings, etc.)
            clone.querySelectorAll('.editor-controls, [data-editor-only], .absolute.top-4.right-4, button:not([class*="cta"])').forEach(el => el.remove());
            
            // Optimization: Image Hints (LCP & Lazy Loading) & Turbo Compression
            const images = clone.querySelectorAll('img');
            images.forEach((img, idx) => {
                // Optimization - Lazy Loading & Priority
                if (idx === 0) {
                    img.setAttribute('fetchpriority', 'high');
                } else {
                    img.setAttribute('loading', 'lazy');
                }

                // Turbo Compression - Supabase Transformation API
                const src = img.getAttribute('src');
                if (src && src.includes('supabase.co/storage/v1/object/public/')) {
                    // Convert object/public to render/image/public
                    // Quality 80, auto format (webp/avif), smart resizing if needed
                    const optimizedUrl = src.replace('/object/public/', '/render/image/public/') + "?quality=80&format=auto";
                    img.setAttribute('src', optimizedUrl);
                }
            });

            // Optimize background images in inline styles
            clone.querySelectorAll('[style*="background-image"]').forEach((el: any) => {
                const style = el.getAttribute('style');
                if (style && style.includes('supabase.co/storage/v1/object/public/')) {
                    const optimizedStyle = style.replace(/\/object\/public\//g, '/render/image/public/');
                    // Add quality/format to URLs inside url()
                    const finalStyle = optimizedStyle.replace(/url\(['"]?([^'"]+)['"]?\)/g, (match, url) => {
                        if (url.includes('supabase.co/storage/v1/render/image/public/')) {
                            const separator = url.includes('?') ? '&' : '?';
                            return `url("${url}${separator}quality=80&format=auto")`;
                        }
                        return match;
                    });
                    el.setAttribute('style', finalStyle);
                }
            });

            const html = clone.innerHTML
                .replace(/\s+/g, ' ')
                .replace(/>\s+</g, '><')
                .trim();

            // 2. Optimized CSS Purging (Client-side)
            let styles = "";
            const usedSelectors = new Set<string>();
            
            // Collect all unique classes and IDs used in the clone to speed up matching
            const allElements = clone.querySelectorAll('*');
            const usedClasses = new Set<string>();
            allElements.forEach(el => {
                el.classList.forEach(cls => usedClasses.add(cls));
                if (el.id) usedSelectors.add(`#${el.id}`);
            });

            for (let i = 0; i < document.styleSheets.length; i++) {
                try {
                    const sheet = document.styleSheets[i];
                    for (let j = 0; j < sheet.cssRules.length; j++) {
                        const rule = sheet.cssRules[j];
                        
                        // Keep essential rules (keyframes, fonts, media queries)
                        if (rule.type === CSSRule.KEYFRAMES_RULE || 
                            rule.type === CSSRule.FONT_FACE_RULE || 
                            rule.type === CSSRule.MEDIA_RULE) {
                            styles += rule.cssText + "\n";
                            continue;
                        }

                        if (rule instanceof CSSStyleRule) {
                            const selector = rule.selectorText;
                            
                            const shouldKeep = 
                                selector === '*' || 
                                selector.includes('html') || 
                                selector.includes('body') ||
                                selector.split(/[\s,>+~:]+/).some(part => {
                                    if (part.startsWith('.')) return usedClasses.has(part.slice(1));
                                    if (part.startsWith('#')) return usedSelectors.has(part);
                                    return false;
                                });

                            if (shouldKeep) {
                                styles += rule.cssText + "\n";
                            }
                        }
                    }
                } catch (e) {
                    // Ignore cross-origin stylesheet errors
                }
            }

            // 3. Generate Responsive Media Queries from mobileSettings
            let responsiveCSS = "\n@media (max-width: 768px) {\n";
            sections.forEach(s => {
                if (s.mobileSettings && Object.keys(s.mobileSettings).length > 0) {
                    responsiveCSS += `  #section-${s.id} {\n`;
                    if (s.mobileSettings.backgroundColor) responsiveCSS += `    background-color: ${s.mobileSettings.backgroundColor} !important;\n`;
                    if (s.mobileSettings.paddingY) {
                        const py = Number(s.mobileSettings.paddingY) * 4;
                        responsiveCSS += `    padding-top: ${py}px !important; padding-bottom: ${py}px !important;\n`;
                    }
                    if (s.mobileSettings.paddingX) {
                        const px = Number(s.mobileSettings.paddingX) * 4;
                        responsiveCSS += `    padding-left: ${px}px !important; padding-right: ${px}px !important;\n`;
                    }
                    if (s.mobileSettings.alignItems) responsiveCSS += `    justify-content: ${s.mobileSettings.alignItems} !important;\n`;
                    if (s.mobileSettings.justifyContent) responsiveCSS += `    align-items: ${s.mobileSettings.justifyContent} !important;\n`;
                    responsiveCSS += `  }\n`;
                }
                s.blocks.forEach(b => {
                    if (b.mobileSettings && Object.keys(b.mobileSettings).length > 0) {
                        responsiveCSS += `  #block-${b.id} {\n`;
                        if (b.mobileSettings.textAlign) responsiveCSS += `    text-align: ${b.mobileSettings.textAlign} !important;\n`;
                        if (b.mobileSettings.height) responsiveCSS += `    height: ${b.mobileSettings.height === 'screen' ? '100vh' : 'auto'} !important;\n`;
                        if (b.mobileSettings.direction) responsiveCSS += `    flex-direction: ${b.mobileSettings.direction} !important;\n`;
                        if (b.mobileSettings.imageWidth) {
                            responsiveCSS += `    width: ${b.mobileSettings.imageWidth}% !important;\n`;
                        }
                        responsiveCSS += `  }\n`;
                    }
                });
            });
            responsiveCSS += "}\n";

            styles += responsiveCSS;

            // Minify CSS
            styles = styles
                .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
                .replace(/\s+/g, ' ')
                .replace(/\s*([{}:;,])\s*/g, '$1')
                .trim();

            const payload = agroforteData
                ? [{ ...agroforteData, customSections: sections }]
                : sections;

            const { error } = await supabase
                .from("portal_pages")
                .update({
                    content_json: payload,
                    is_published: true,
                    published_html: html,
                    published_css: styles,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", id);
            
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portal_page", id] });
            toast.success("Site publicado com otimização turbo! 🚀");
        },
        onError: (err: any) => {
            toast.error(err.message || "Erro ao publicar");
        }
    });

    if (isLoading) return <div className="p-20"><Skeleton className="h-full w-full rounded-3xl" /></div>;

    const customBlocksPanel = (
        <div className="space-y-4">
            <div className="pt-2 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <DraggableBlockButton icon={<Layout />} label="Header" type="header" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'header', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<Layout />} label="Hero" type="hero" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'hero', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<ImageIcon />} label="Slider" type="slider" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'slider', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<Layout />} label="Cards" type="info-cards" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'info-cards', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<Plus />} label="Grid" type="grid" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'grid', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<ImageIcon />} label="Galeria" type="gallery" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'gallery', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<Type />} label="Título" type="title" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'title', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<AlignLeft />} label="Texto" type="text" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'text', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<ImageIcon />} label="Imagem" type="image" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'image', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<LinkIcon />} label="Links" type="links" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'links', activeColumnId.colId)} />
                    <DraggableBlockButton icon={<Plus />} label="HTML" type="html" onClick={() => activeColumnId && addBlock(activeColumnId.sectionId, 'html', activeColumnId.colId)} />
                </div>
                <p className="text-[10px] text-blue-600 bg-blue-50 p-3 rounded-xl leading-relaxed">
                    <strong>Dica:</strong> Arraste os componentes diretamente para dentro das seções no palco.
                </p>
            </div>
        </div>
    );

    const renderCustomSections = (
        <div className="w-full pb-20">
            
                    <SortableContext items={layoutOrder} strategy={verticalListSortingStrategy}>
                        {layoutOrder.map((id) => {
                            const customSection = sections.find(s => s.id === id);
                            if (customSection) {
                                return (
                                    <SortableSectionItem
                                        key={customSection.id}
                                        section={customSection}
                                        previewMode={previewMode}
                                        active={activeSettingsTarget?.id === customSection.id}
                                        onSelect={() => setActiveSettingsTarget({ type: 'section', id: customSection.id })}
                                        onRemove={() => removeSection(customSection.id)}
                                        onUpdateSettings={(settings: any) => updateSectionSettings(customSection.id, settings)}
                                        onUpdateBlock={(blockId: string, updates: any) => updateBlock(customSection.id, blockId, updates)}
                                        onRemoveBlock={(blockId: string) => removeBlock(customSection.id, blockId)}
                                        onSettingsClick={(blockId?: string) => {
                                            if (blockId) {
                                                setActiveSettingsTarget({ type: 'block', id: customSection.id, blockId });
                                            } else {
                                                setActiveSettingsTarget({ type: 'section', id: customSection.id });
                                            }
                                        }}
                                        onAddSectionAbove={() => {
                                            const newSection: Section = { id: Math.random().toString(36).substr(2, 9), blocks: [], settings: {} };
                                            setSections([...sections, newSection]);
                                            setAgroforteData(prev => {
                                                if (!prev) return prev;
                                                const order = prev.layoutOrder || layoutOrder;
                                                let newOrder = [...order];
                                                const idx = newOrder.indexOf(customSection.id);
                                                if (idx !== -1) newOrder.splice(idx, 0, newSection.id);
                                                return { ...prev, layoutOrder: newOrder };
                                            });
                                        }}
                                        onAddWidgetClick={(secId: string, colId: string) => {
                                            setActiveColumnId({ sectionId: secId, colId });
                                            setActiveSettingsTarget(null); // Ensure sidebar shows component list
                                        }}
                                    />
                                );
                            } else {
                                return (
                                    <SortableFixedSectionItem 
                                        key={id} 
                                        id={id} 
                                        previewMode={previewMode}
                                        active={activeSettingsTarget?.id === id}
                                        onSettingsClick={() => setActiveSettingsTarget({ type: 'fixed_section', id })}
                                    >
                                        <AgroForteRenderer data={agroforteData!} sectionToRender={id} editMode={true} onSelectElement={(elId) => setActiveSettingsTarget({ type: 'fixed_section', id: elId })} />
                                    </SortableFixedSectionItem>
                                );
                            }
                        })}
                    </SortableContext>

            <div className="border border-dashed border-slate-300 bg-white/50 mx-8 mt-4 p-8 flex flex-col items-center justify-center relative min-h-[160px]">
                <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-3">
                        <Popover open={isAddingSection} onOpenChange={setIsAddingSection}>
                            <PopoverTrigger asChild>
                                <button 
                                    className="h-12 w-12 rounded-full bg-[#9b3a5a] text-white flex items-center justify-center shadow hover:opacity-90 transition-opacity relative group"
                                >
                                    <Plus className="h-6 w-6" />
                                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
                                        Adicionar seção
                                    </div>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="center" className="w-[500px] p-8 rounded-none border-dashed border-slate-300 shadow-xl" sideOffset={20}>
                                <div className="text-center mb-8">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Selecione Sua Estrutura</h3>
                                </div>
                                <div className="grid grid-cols-6 gap-3">
                                    {/* Row 1 */}
                                    <div onClick={() => { addSectionWithStructure([100]); setIsAddingSection(false); }} className="col-span-2 h-16 bg-slate-200 hover:bg-blue-200 cursor-pointer transition-colors" />
                                    <div onClick={() => { addSectionWithStructure([50, 50]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-1/2 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/2 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    <div onClick={() => { addSectionWithStructure([33.3, 33.3, 33.3]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-1/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    
                                    {/* Row 2 */}
                                    <div onClick={() => { addSectionWithStructure([25, 25, 25, 25]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    <div onClick={() => { addSectionWithStructure([33.3, 66.6]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-1/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-2/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    <div onClick={() => { addSectionWithStructure([66.6, 33.3]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-2/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/3 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    
                                    {/* Row 3 */}
                                    <div onClick={() => { addSectionWithStructure([16.6, 66.6, 16.6]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-[16.6%] bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-[66.6%] bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-[16.6%] bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    <div onClick={() => { addSectionWithStructure([50, 25, 25]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-1/2 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                    <div onClick={() => { addSectionWithStructure([25, 25, 50]); setIsAddingSection(false); }} className="col-span-2 h-16 flex gap-1 cursor-pointer group"><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/4 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /><div className="w-1/2 bg-slate-200 group-hover:bg-blue-200 transition-colors h-full" /></div>
                                </div>
                            </PopoverContent>
                        </Popover>
                        
                        <button 
                            className="h-12 w-12 rounded-full bg-slate-500 text-white flex items-center justify-center shadow hover:opacity-90 transition-opacity"
                            title="Adicionar template"
                        >
                            <Folder className="h-5 w-5 fill-current" />
                        </button>
                    </div>
                    <p className="text-sm text-slate-400 italic mt-3">Solte o widget aqui</p>
                </div>
            </div>
        </div>
    );

    const dndOverlay = (
        <DragOverlay dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
                styles: { active: { opacity: '0.5' } },
            }),
        }}>
            {activeId ? (
                activeData?.type === 'new-block' ? (
                    <div className="p-4 bg-white border-2 border-blue-500 rounded-2xl shadow-2xl opacity-80 flex items-center gap-3">
                        <Layout className="h-5 w-5 text-blue-500" />
                        <span className="font-bold text-sm text-slate-700 capitalize">{activeData.blockType}</span>
                    </div>
                ) : (
                    <div className="p-4 bg-white border-2 border-blue-500 rounded-2xl shadow-2xl opacity-80 w-80">
                        <div className="h-4 w-2/3 bg-slate-100 rounded mb-2"></div>
                        <div className="h-3 w-full bg-slate-50 rounded"></div>
                    </div>
                )
            ) : null}
        </DragOverlay>
    );

    if (agroforteData) {
        return (
            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
            <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
                {/* AgroForte Sidebar */}
                <div className="w-[340px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => navigate('/app/portal')}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h2 className="font-semibold text-sm leading-none">Editor de Portal</h2>
                            <p className="text-[10px] text-green-600 font-semibold mt-0.5">🌿 Template AgroForte</p>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeSettingsTarget ? (
                            <div className="space-y-6">
                                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-100">
                                        <Button variant="ghost" size="icon" className="rounded-full h-6 w-6" onClick={() => setActiveSettingsTarget(null)}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Label className="text-[10px] uppercase text-slate-400 font-bold">Propriedades</Label>
                                    </div>
                                    
                                    {activeSettingsTarget.type === 'fixed_section' && (
                                        <FixedSectionLayoutEditor 
                                            type={activeSettingsTarget.id === 'fixed-header' ? 'header' : 'footer'}
                                            settings={agroforteData?.layoutSettings?.[activeSettingsTarget.id] || {}} 
                                            onChange={(newSettings) => {
                                                if (!agroforteData) return;
                                                setAgroforteData({
                                                    ...agroforteData,
                                                    layoutSettings: {
                                                        ...(agroforteData.layoutSettings || {}),
                                                        [activeSettingsTarget.id]: newSettings
                                                    }
                                                });
                                            }} 
                                        />
                                    )}
                                    {(activeSettingsTarget.type === 'section' || activeSettingsTarget.type === 'block') && (() => {
                                        const activeBlockItem = activeSettingsTarget.type === 'block' && activeSettingsTarget.blockId ? findContainer(activeSettingsTarget.blockId) : null;
                                        const activeBlock = activeBlockItem?.block;
                                        return (
                                            <div className="space-y-4">
                                                {activeBlock ? (
                                                    <BlockPropertiesPanel 
                                                        block={activeBlock} 
                                                        onChange={(updates) => updateBlock(activeSettingsTarget.id, activeSettingsTarget.blockId!, updates)}
                                                    />
                                                ) : activeSettingsTarget.type === 'section' ? (
                                                    <SectionPropertiesPanel 
                                                        section={sections.find(s => s.id === activeSettingsTarget.id)}
                                                        onChange={(updates) => updateSectionSettings(activeSettingsTarget.id, updates)}
                                                    />
                                                ) : (
                                                    <p className="text-sm text-slate-500">Selecione um bloco para editar as propriedades.</p>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ) : (
                            <AgroForteEditor
                                data={agroforteData}
                                onChange={(d) => setAgroforteData(d)}
                                activeElementId={activeElementId}
                                onBack={() => setActiveElementId(null)}
                                renderCustomBlocksPanel={() => customBlocksPanel}
                            />
                        )}
                    </div>
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <Button
                            className="w-full rounded-xl gap-2 h-11 bg-green-700 hover:bg-green-800 text-white"
                            onClick={() => handleAgroforteSave(agroforteData)}
                            disabled={saveM.isPending}
                        >
                            <Save className="h-4 w-4" />
                            {saveM.isPending ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                        <Button
                            className="w-full rounded-xl gap-2 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                            onClick={() => publishM.mutate()}
                            disabled={publishM.isPending}
                        >
                            <Globe className="h-4 w-4" />
                            {publishM.isPending ? 'Publicando...' : 'Publicar Site'}
                        </Button>
                    </div>
                </div>

                {/* AgroForte Preview */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-8">
                        <div className="flex items-center gap-2">
                            <Button
                                variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                                size="sm" className="rounded-lg h-9"
                                onClick={() => setPreviewMode('desktop')}
                            >
                                <Monitor className="h-4 w-4 mr-2" /> Desktop
                            </Button>
                            <Button
                                variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                                size="sm" className="rounded-lg h-9"
                                onClick={() => setPreviewMode('mobile')}
                            >
                                <Smartphone className="h-4 w-4 mr-2" /> Mobile
                            </Button>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-500 font-medium">{page?.title}</span>
                            <Button variant="outline" size="sm" className="rounded-lg h-9 gap-2" onClick={() => window.open(`/l/${page?.slug}`, '_blank')}>
                                <Eye className="h-4 w-4" /> Visualizar
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 p-8 bg-slate-100 dark:bg-slate-950 flex justify-center overflow-hidden">
                        <div className={cn(
                            "transition-all duration-500 bg-white shadow-2xl overflow-y-auto h-full",
                            previewMode === 'desktop' ? "w-full max-w-[95%] rounded-[32px]" : "w-[375px] rounded-[48px] border-[10px] border-slate-800"
                        )}>
                            <div id="editor-stage">
                                <AgroForteRenderer 
                                    data={agroforteData} 
                                    editMode={true}
                                    onSelectElement={(id) => setActiveElementId(id)}
                                    customSectionsContent={renderCustomSections}
                                    sectionToRender="root"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {dndOverlay}
            </DndContext>
        );
    }
    // ────────────────────────────────────────────────────────────────────────

    return (
        <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            {/* Sidebar - Blocks */}
            <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col z-50 shadow-2xl relative">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => activeSettingsTarget ? setActiveSettingsTarget(null) : navigate('/app/portal')}>
                            {activeSettingsTarget ? <GripVertical className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        </Button>
                        <h2 className="font-semibold">{activeSettingsTarget ? (activeSettingsTarget.type === 'section' || activeSettingsTarget.type === 'fixed_section' ? 'Editar Seção' : 'Editar Bloco') : 'Editor'}</h2>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto bg-slate-50/50">
                    {activeSettingsTarget ? (
                        <div className="p-4 space-y-6">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold mb-4 block">Propriedades</Label>
                                {activeSettingsTarget.type === 'fixed_section' && (
                                    <FixedSectionLayoutEditor 
                                        settings={agroforteData?.layoutSettings?.[activeSettingsTarget.id] || {}} 
                                        onChange={(newSettings) => {
                                            if (!agroforteData) return;
                                            setAgroforteData({
                                                ...agroforteData,
                                                layoutSettings: {
                                                    ...(agroforteData.layoutSettings || {}),
                                                    [activeSettingsTarget.id]: newSettings
                                                }
                                            });
                                        }} 
                                    />
                                )}
                                {(activeSettingsTarget.type === 'section' || activeSettingsTarget.type === 'block') && (() => {
                                    const activeBlockItem = activeSettingsTarget.type === 'block' && activeSettingsTarget.blockId ? findContainer(activeSettingsTarget.blockId) : null;
                                    const activeBlock = activeBlockItem?.block;
                                    return (
                                        <div className="space-y-4">
                                            {activeBlock ? (
                                                <BlockPropertiesPanel 
                                                    block={activeBlock} 
                                                    onChange={(updates) => updateBlock(activeSettingsTarget.id, activeSettingsTarget.blockId!, updates)}
                                                />
                                            ) : activeSettingsTarget.type === 'section' ? (
                                                <SectionPropertiesPanel 
                                                    section={sections.find(s => s.id === activeSettingsTarget.id)}
                                                    onChange={(updates) => updateSectionSettings(activeSettingsTarget.id, updates)}
                                                />
                                            ) : (
                                                <p className="text-sm text-slate-500">Selecione um bloco para editar as propriedades.</p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 space-y-4">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Elementos</Label>
                            {customBlocksPanel}
                            <div className="pt-4">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-2 block">Página</Label>
                                <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">Publicado</Label>
                                        <Switch checked={page?.is_published} onCheckedChange={(val) => saveM.mutate({ is_published: val })} />
                                    </div>
                                    <Button variant="outline" className="w-full text-xs h-8" onClick={() => setActiveData({ blockType: 'settings' })}>
                                        <Settings className="w-3.5 h-3.5 mr-2" />
                                        Configurações de Template
                                    </Button>
                                    <Button className="w-full rounded-xl gap-2 h-11" onClick={handleSave} disabled={saveM.isPending}>
                                        <Save className="h-4 w-4" />
                                        {saveM.isPending ? "Salvando..." : "Salvar Alterações"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-8">
                    <div className="flex items-center gap-2">
                        <Button 
                            variant={previewMode === 'desktop' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="rounded-lg h-9"
                            onClick={() => setPreviewMode('desktop')}
                        >
                            <Monitor className="h-4 w-4 mr-2" /> Desktop
                        </Button>
                        <Button 
                            variant={previewMode === 'mobile' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="rounded-lg h-9"
                            onClick={() => setPreviewMode('mobile')}
                        >
                            <Smartphone className="h-4 w-4 mr-2" /> Mobile
                        </Button>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-500 font-medium">{page?.title}</span>
                        <div className="h-4 w-[1px] bg-slate-200" />
                        <Button variant="outline" size="sm" className="rounded-lg h-9 gap-2" onClick={() => window.open(`/l/${page?.slug}`, '_blank')}>
                            <Eye className="h-4 w-4" /> Visualizar
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="rounded-lg h-9 gap-2" 
                            onClick={handleSave}
                            disabled={saveM.isPending}
                        >
                            <Save className="h-4 w-4" /> 
                            {saveM.isPending ? "Salvando..." : "Salvar Rascunho"}
                        </Button>
                        <Button 
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-9 gap-2 font-bold px-6" 
                            size="sm"
                            onClick={() => publishM.mutate()}
                            disabled={publishM.isPending}
                        >
                            <Globe className="h-4 w-4" />
                            {publishM.isPending ? "Publicando..." : "Publicar Site"}
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 bg-slate-100 dark:bg-slate-950 flex justify-center">
                    <div className={cn(
                        "transition-all duration-500 bg-white dark:bg-slate-900 shadow-2xl min-h-[800px]",
                        previewMode === 'desktop' ? "w-full max-w-[95%] rounded-[40px]" : "w-[375px] rounded-[60px] border-[12px] border-slate-800"
                    )}>
                        {/* Render Editor Blocks */}
                        <div className="relative" id="editor-stage">
                            {renderCustomSections}
                        </div>
                    </div>
                </div>
                </div>
            </div>

            <DragOverlay dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                    styles: {
                        active: {
                            opacity: '0.5',
                        },
                    },
                }),
            }}>
                {activeId ? (
                    activeData?.type === 'new-block' ? (
                        <div className="p-4 bg-white border-2 border-blue-500 rounded-2xl shadow-2xl opacity-80 flex items-center gap-3">
                            <Layout className="h-5 w-5 text-blue-500" />
                            <span className="font-bold text-sm text-slate-700 capitalize">{activeData.blockType}</span>
                        </div>
                    ) : (
                        <div className="p-4 bg-white border-2 border-blue-500 rounded-2xl shadow-2xl opacity-80 w-80">
                            <div className="h-4 w-2/3 bg-slate-100 rounded mb-2"></div>
                            <div className="h-3 w-full bg-slate-50 rounded"></div>
                        </div>
                    )
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

function DraggableBlockButton({ icon, label, type, active, onClick }: { icon: React.ReactNode, label: string, type: BlockType, active?: boolean, onClick?: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging
    } = useDraggable({
        id: `sidebar-${type}`,
        data: {
            type: 'new-block',
            blockType: type,
        },
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
    } : undefined;

    return (
        <button 
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={(e) => {
                if (onClick) {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all text-slate-600 dark:text-slate-400",
                "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 group hover:border-blue-500 hover:text-blue-600",
                isDragging && "opacity-50 border-blue-500 ring-2 ring-blue-500/20"
            )}
        >
            <div className={cn("p-2 rounded-xl bg-slate-50 group-hover:bg-blue-100 transition-colors")}>
                {icon}
            </div>
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}


function SortableFixedSectionItem({ id, children, previewMode, active, onSettingsClick }: { id: string, children: React.ReactNode, previewMode: string, active?: boolean, onSettingsClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} onClick={onSettingsClick} className={cn("relative group/fixed-section border-2 transition-all overflow-hidden mb-8", active ? "border-blue-500 rounded-[32px] ring-4 ring-blue-500/20" : "border-transparent hover:border-blue-500 rounded-[32px]")}>
            <div className={cn("absolute right-6 top-0 z-50 bg-blue-500 text-white rounded-b-xl shadow-lg flex items-center h-8 transition-all overflow-hidden divide-x divide-blue-400/50", active ? "translate-y-0 opacity-100" : "opacity-0 group-hover/fixed-section:opacity-100 translate-y-[-100%] group-hover/fixed-section:translate-y-0")}>
                <div onClick={(e) => { e.stopPropagation(); onSettingsClick(); }} className="px-3 h-full flex items-center text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-blue-600 transition-colors">
                    Seção Fixa
                </div>
                <button onClick={(e) => { e.stopPropagation(); onSettingsClick(); }} className="p-1.5 px-3 hover:bg-blue-600 transition-colors cursor-pointer" title="Configurações">
                    <Settings className="h-4 w-4" />
                </button>
                <div 
                    {...attributes} 
                    {...listeners} 
                    onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
                    onPointerUp={(e) => { e.stopPropagation(); onSettingsClick(); }}
                    className="p-1.5 px-3 hover:bg-blue-600 transition-colors cursor-grab active:cursor-grabbing" 
                    title="Arrastar ou Configurar"
                >
                    <GripVertical className="h-4 w-4" />
                </div>
            </div>
            {/* Click overlay to ensure clicks register over the fixed section */}
            <div className="absolute inset-0 z-10 cursor-pointer" onClick={(e) => { e.stopPropagation(); onSettingsClick(); }} />
            <div className="pointer-events-none relative z-0">
                {children}
            </div>
        </div>
    );
}

function DroppableEmptyColumn({ sectionId, colId, onAddWidgetClick }: { sectionId: string, colId: string, onAddWidgetClick: any }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `empty-col-${sectionId}-${colId}`,
        data: { type: 'empty-col', sectionId, colId }
    });

    return (
        <div 
            ref={setNodeRef}
            className={cn("h-24 border border-dashed rounded-lg flex items-center justify-center transition-colors", isOver ? "border-blue-500 bg-blue-100 ring-2 ring-blue-500/30" : "border-slate-300 bg-slate-50/50 group-hover/col:border-blue-300")}
        >
            <button 
                onClick={(e) => { e.stopPropagation(); onAddWidgetClick?.(sectionId, colId); }}
                className="h-8 w-8 rounded-full bg-[#9b3a5a] text-white flex items-center justify-center shadow hover:opacity-90 transition-opacity"
            >
                <Plus className="h-4 w-4" />
            </button>
        </div>
    );
}

function SortableSectionItem({ section, previewMode, active, onSelect, onRemove, onUpdateSettings, onUpdateBlock, onRemoveBlock, onAddSectionAbove, onSettingsClick, onAddWidgetClick }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.8 : 1 };
    const sectionPadding = section.settings?.paddingY || '12';

    return (
        <div ref={setNodeRef} style={style} className={cn("group relative border-2 transition-all mb-8 rounded-[32px]", active ? "border-blue-500 bg-blue-50/50 ring-4 ring-blue-500/20" : "border-transparent hover:border-blue-500/50")} onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}>
            <div className={cn("absolute right-6 top-0 z-50 bg-white border border-slate-200 text-slate-700 rounded-b-xl shadow-xl flex items-center h-8 transition-all overflow-hidden divide-x divide-slate-100", active ? "translate-y-0 opacity-100" : "opacity-0 group-hover:opacity-100 translate-y-[-100%] group-hover:translate-y-0")}>
                <div onClick={(e) => { e.stopPropagation(); onSettingsClick(); }} className="px-3 h-full flex items-center text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50/50 cursor-pointer hover:bg-blue-100 transition-colors">
                    Seção Livre
                </div>
                <button onClick={(e) => { e.stopPropagation(); onSettingsClick(); }} className="p-1.5 px-3 hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600 focus:outline-none" title="Configurações">
                    <Settings className="h-4 w-4" />
                </button>
                <div 
                    {...attributes} 
                    {...listeners} 
                    onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
                    onPointerUp={(e) => { e.stopPropagation(); onSettingsClick(); }}
                    className="p-1.5 px-3 hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing focus:outline-none" 
                    title="Arrastar ou Configurar"
                >
                    <GripVertical className="h-4 w-4" />
                </div>
                <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 px-3 hover:bg-red-50 hover:text-red-600 transition-colors text-slate-400 focus:outline-none">
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
            <div className="w-full relative rounded-[32px] overflow-hidden" style={{ backgroundColor: section.settings?.backgroundColor, backgroundImage: section.settings?.backgroundImage ? `url(${section.settings.backgroundImage})` : undefined, backgroundSize: section.settings?.backgroundSize || 'cover', backgroundPosition: section.settings?.backgroundPosition || 'center' }}>
                {section.settings?.backgroundOverlay && <div className="absolute inset-0 z-0" style={{ backgroundColor: section.settings.backgroundOverlay }}></div>}
                <div className={cn("relative z-10", `py-${sectionPadding}`, previewMode === 'mobile' ? 'px-4' : 'px-8')}>
                    <div className={cn("mx-auto flex gap-4", previewMode === 'mobile' ? 'w-full flex-col' : 'max-w-7xl')}>
                        {section.columns ? (
                            section.columns.map((col: any) => (
                                <div key={col.id} style={{ width: previewMode === 'mobile' ? '100%' : `${col.size}%` }} className="flex flex-col gap-4 relative group/col">
                                    <SortableContext items={(col.blocks || []).map((b: any) => b.id)} strategy={verticalListSortingStrategy}>
                                        {(col.blocks || []).map((block: any) => (
                                            <SortableBlockItem 
                                                key={block.id} 
                                                block={block}
                                                sectionId={section.id}
                                                previewMode={previewMode}
                                                onUpdate={(updates: any) => onUpdateBlock(block.id, updates)}
                                                onRemove={() => onRemoveBlock(block.id)}
                                                onSettingsClick={() => onSettingsClick(block.id)}
                                            />
                                        ))}
                                    </SortableContext>
                                    
                                    {(!col.blocks || col.blocks.length === 0) && (
                                        <DroppableEmptyColumn sectionId={section.id} colId={col.id} onAddWidgetClick={onAddWidgetClick} />
                                    )}
                                </div>
                            ))
                        ) : (
                            // Legacy blocks
                            <div className="w-full flex flex-col gap-4">
                                <SortableContext items={(section.blocks || []).map((b: any) => b.id)} strategy={verticalListSortingStrategy}>
                                    {(section.blocks || []).map((block: any) => (
                                        <SortableBlockItem 
                                            key={block.id} 
                                            block={block}
                                            sectionId={section.id}
                                            previewMode={previewMode}
                                            onUpdate={(updates: any) => onUpdateBlock(block.id, updates)}
                                            onRemove={() => onRemoveBlock(block.id)}
                                            onSettingsClick={() => onSettingsClick(block.id)}
                                        />
                                    ))}
                                </SortableContext>
                                {(!section.blocks || section.blocks.length === 0) && (
                                    <div className="py-12 border-2 border-dashed border-slate-200/50 rounded-2xl flex flex-col items-center justify-center bg-white/20 backdrop-blur-sm">
                                        <p className="text-sm font-medium text-slate-500">Seção sem colunas</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SortableBlockItem({ block, sectionId, previewMode, isNested, onUpdate, onRemove, onSettingsClick }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.5 : 1 };

    return (
        <div ref={setNodeRef} style={style} className="group/block relative border border-transparent hover:border-blue-400 rounded-xl transition-all" onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}>
            <div className="absolute right-2 top-2 z-50 bg-white shadow-md border border-slate-200 rounded-lg flex items-center h-7 opacity-0 group-hover/block:opacity-100 transition-opacity divide-x divide-slate-100">
                <div {...attributes} {...listeners} className="p-1 px-2 hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-3.5 w-3.5" />
                </div>
                <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 px-2 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="mt-2 pointer-events-none">
                <PortalBlockRenderer 
                    block={block} 
                    isPremium={false} 
                    isMobile={previewMode === 'mobile'} 
                    editMode={true}
                    onUpdateContent={(content) => onUpdate({ content })}
                    onRenderInnerBlock={(innerBlock: any) => (
                        <SortableBlockItem 
                            key={innerBlock.id} 
                            block={innerBlock}
                            sectionId={sectionId}
                            previewMode={previewMode}
                            isNested={true}
                            onUpdate={(innerUpdates: any) => {
                                const newBlocks = block.content.blocks.map((b: any) => b.id === innerBlock.id ? { ...b, ...innerUpdates } : b);
                                onUpdate({ content: { ...block.content, blocks: newBlocks } });
                            }}
                            onRemove={() => {
                                const newBlocks = block.content.blocks.filter((b: any) => b.id !== innerBlock.id);
                                onUpdate({ content: { ...block.content, blocks: newBlocks } });
                            }}
                            onSettingsClick={() => onSettingsClick(innerBlock.id)}
                        />
                    )}
                />
            </div>
        </div>
    );
}
