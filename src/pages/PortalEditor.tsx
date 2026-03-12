import { useState, useEffect, useCallback } from "react";
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
    Smartphone
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
    Settings,
    Maximize,
    AlignCenter,
    StretchHorizontal
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
};

type PageSettings = {
    layout?: 'default' | 'sidebar';
    sidebarLogo?: string;
    socialLinks?: { type: string, url: string }[];
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
    blocks: Block[];
};

export default function PortalEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sections, setSections] = useState<Section[]>([]);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeData, setActiveData] = useState<any>(null);

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

    const addSection = (type?: BlockType) => {
        const newSection: Section = {
            id: Math.random().toString(36).substr(2, 9),
            settings: { paddingY: '12', maxWidth: '1400' },
            blocks: type ? [
                { id: Math.random().toString(36).substr(2, 9), type, content: type === 'grid' ? { columns: 2 } : type === 'gallery' ? { items: [] } : {} }
            ] : []
        };
        setSections([...sections, newSection]);
    };

    const addBlock = (sectionId: string, type: BlockType) => {
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
        setSections(sections.map(s => s.id === sectionId ? { ...s, blocks: [...s.blocks, newBlock] } : s));
    };

    const removeSection = (sectionId: string) => {
        setSections(sections.filter(s => s.id !== sectionId));
    };

    const removeBlock = (sectionId: string, blockId: string) => {
        setSections(sections.map(s => s.id === sectionId ? { ...s, blocks: s.blocks.filter(b => b.id !== blockId) } : s));
    };

    const updateBlock = (sectionId: string, blockId: string, updates: any) => {
        setSections(sections.map(s => s.id === sectionId ? {
            ...s,
            blocks: s.blocks.map(b => {
                if (b.id !== blockId) return b;
                
                const { settings, blocks, ...contentUpdates } = updates;
                let updatedBlock = { ...b };
                
                if (settings) {
                    updatedBlock.settings = { ...(updatedBlock.settings || {}), ...settings };
                }
                
                if (blocks) {
                    updatedBlock.blocks = blocks;
                }
                
                if (Object.keys(contentUpdates).length > 0) {
                    updatedBlock.content = { ...(updatedBlock.content || {}), ...contentUpdates };
                }
                
                return updatedBlock;
            })
        } : s));
    };

    const updateSectionSettings = (sectionId: string, settings: Partial<Section['settings']>) => {
        setSections(sections.map(s => s.id === sectionId ? { ...s, settings: { ...s.settings, ...settings } } : s));
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveData(event.active.data.current);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // Find the containers
        const activeContainer = sections.find(s => s.id === activeId || s.blocks.some(b => b.id === activeId));
        const overContainer = sections.find(s => s.id === overId || s.blocks.some(b => b.id === overId));

        if (!activeContainer || !overContainer || activeContainer === overContainer) {
            return;
        }

        // If dragging sidebar block into a section
        if (active.data.current?.type === 'new-block') {
            return;
        }

        // If dragging a section
        if (activeContainer.id === activeId || overContainer.id === overId) {
            return;
        }

        setSections(prev => {
            const activeSectionIndex = prev.findIndex(s => s.id === activeContainer.id);
            const overSectionIndex = prev.findIndex(s => s.id === overContainer.id);

            const activeBlockIndex = activeContainer.blocks.findIndex(b => b.id === activeId);
            const overBlockIndex = overContainer.blocks.findIndex(b => b.id === overId);

            let newIndex;
            if (overId in prev.map(s => s.id)) {
                newIndex = overContainer.blocks.length + 1;
            } else {
                const isBelowOverItem =
                    over &&
                    active.rect.current.translated &&
                    active.rect.current.translated.top >
                    over.rect.top + over.rect.height;

                const modifier = isBelowOverItem ? 1 : 0;
                newIndex = overBlockIndex >= 0 ? overBlockIndex + modifier : overContainer.blocks.length + 1;
            }

            const newSections = [...prev];
            const [movedBlock] = newSections[activeSectionIndex].blocks.splice(activeBlockIndex, 1);
            newSections[overSectionIndex].blocks.splice(newIndex, 0, movedBlock);

            return newSections;
        });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveData(null);

        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // Case 1: Dragging Sidebar Item to Section
        if (active.data.current?.type === 'new-block') {
            const blockType = active.data.current.blockType;
            const overSectionId = over.data.current?.sectionId || overId;
            const overSection = sections.find(s => s.id === overSectionId || s.blocks.some(b => b.id === overSectionId));
            
            if (overSection) {
                // Initialize default content
                let content = {};
                if (blockType === 'header') content = { variant: 'logo-left', logoText: page?.title || 'Byfrost', links: [], cta: { label: 'CTA', url: '#' } };
                if (blockType === 'hero') content = { title: 'Destaque', subtitle: 'Complemento' };
                if (blockType === 'text') content = { text: 'Conteúdo de texto' };
                if (blockType === 'grid') content = { columns: 2 };
                if (blockType === 'gallery') content = { items: [] };

                const newBlock: Block = {
                    id: Math.random().toString(36).substr(2, 9),
                    type: blockType,
                    content
                };

                setSections(prev => prev.map(s => {
                    if (s.id === overSection.id) {
                        const overBlockIndex = s.blocks.findIndex(b => b.id === overId);
                        const newBlocks = [...s.blocks];
                        if (overBlockIndex >= 0) {
                            newBlocks.splice(overBlockIndex, 0, newBlock);
                        } else {
                            newBlocks.push(newBlock);
                        }
                        return { ...s, blocks: newBlocks };
                    }
                    return s;
                }));
            }
            return;
        }

        // Case 2: Reordering Sections
        const activeSectionIndex = sections.findIndex(s => s.id === activeId);
        const overSectionIndex = sections.findIndex(s => s.id === overId);

        if (activeSectionIndex !== -1 && overSectionIndex !== -1) {
            if (activeId !== overId) {
                setSections(items => arrayMove(items, activeSectionIndex, overSectionIndex));
            }
            return;
        }

        // Case 3: Reordering Blocks within same Section (handleDragOver handles different sections)
        const currentSection = sections.find(s => s.blocks.some(b => b.id === activeId));
        if (currentSection) {
            const activeBlockIndex = currentSection.blocks.findIndex(b => b.id === activeId);
            const overBlockIndex = currentSection.blocks.findIndex(b => b.id === overId);

            if (activeBlockIndex !== -1 && overBlockIndex !== -1 && activeBlockIndex !== overBlockIndex) {
                setSections(prev => prev.map(s => {
                    if (s.id === currentSection.id) {
                        return { ...s, blocks: arrayMove(s.blocks, activeBlockIndex, overBlockIndex) };
                    }
                    return s;
                }));
            }
        }
    };

    const handleSave = () => {
        saveM.mutate({
            content_json: sections,
            updated_at: new Date().toISOString(),
        });
    };

    if (isLoading) return <div className="p-20"><Skeleton className="h-full w-full rounded-3xl" /></div>;

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
            <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => navigate('/app/portal')}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="font-semibold">Editor de Portal</h2>
                </div>
                
                <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estrutura</p>
                    <Button variant="outline" className="w-full rounded-xl gap-2 border-dashed" onClick={() => addSection()}>
                        <Plus className="h-4 w-4" /> Nova Seção
                    </Button>

                    <div className="pt-4 space-y-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Componentes</p>
                        <div className="grid grid-cols-2 gap-3">
                            <DraggableBlockButton icon={<Layout />} label="Header" type="header" />
                            <DraggableBlockButton icon={<Layout />} label="Hero" type="hero" />
                            <DraggableBlockButton icon={<ImageIcon />} label="Slider" type="slider" />
                            <DraggableBlockButton icon={<Layout />} label="Cards" type="info-cards" />
                            <DraggableBlockButton icon={<Plus />} label="Grid" type="grid" />
                            <DraggableBlockButton icon={<ImageIcon />} label="Galeria" type="gallery" />
                            <DraggableBlockButton icon={<Type />} label="Texto" type="text" />
                            <DraggableBlockButton icon={<ImageIcon />} label="Imagem" type="image" />
                            <DraggableBlockButton icon={<LinkIcon />} label="Links" type="links" />
                            <DraggableBlockButton icon={<Plus />} label="HTML" type="html" />
                        </div>
                        <p className="text-[10px] text-blue-600 bg-blue-50 p-3 rounded-xl leading-relaxed">
                            <strong>Dica:</strong> Arraste os componentes diretamente para dentro das seções no palco.
                        </p>
                    </div>

                    <div className="pt-8 space-y-6">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configurações</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">Publicado</Label>
                                <Switch 
                                    checked={page?.is_published} 
                                    onCheckedChange={(val) => saveM.mutate({ is_published: val })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm">URL da Página</Label>
                                <Input value={page?.slug} readOnly className="bg-slate-50 text-xs h-9 rounded-lg" />
                            </div>
                            <div className="pt-4 space-y-3">
                                <Label className="text-xs text-slate-400 font-bold uppercase">Layout Premium</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button 
                                        variant={(page?.page_settings?.layout || 'default') === 'default' ? 'secondary' : 'outline'} 
                                        size="sm" 
                                        className="text-[10px] h-8"
                                        onClick={() => saveM.mutate({ page_settings: { ...page?.page_settings, layout: 'default' } })}
                                    >Padrão</Button>
                                    <Button 
                                        variant={page?.page_settings?.layout === 'sidebar' ? 'secondary' : 'outline'} 
                                        size="sm" 
                                        className="text-[10px] h-8"
                                        onClick={() => saveM.mutate({ page_settings: { ...page?.page_settings, layout: 'sidebar' } })}
                                    >Sidebar</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800">
                    <Button className="w-full rounded-xl gap-2 h-11" onClick={handleSave} disabled={saveM.isPending}>
                        <Save className="h-4 w-4" />
                        {saveM.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
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
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 bg-slate-100 dark:bg-slate-950 flex justify-center">
                    <div className={cn(
                        "transition-all duration-500 bg-white dark:bg-slate-900 shadow-2xl min-h-[800px]",
                        previewMode === 'desktop' ? "w-full max-w-[95%] rounded-[40px]" : "w-[375px] rounded-[60px] border-[12px] border-slate-800"
                    )}>
                        {/* Render Editor Blocks */}
                        <div className="relative">
                            <SortableContext 
                                items={sections.map(s => s.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {sections.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center p-20 text-center opacity-40">
                                        <Layout className="h-12 w-12 mb-4" />
                                        <p>Sua página está vazia.<br/>Comece adicionando uma seção.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 p-4">
                                        {sections.map((section) => (
                                            <SortableSectionItem 
                                                key={section.id}
                                                section={section}
                                                active={activeSectionId === section.id}
                                                onSelect={() => setActiveSectionId(section.id)}
                                                onRemove={() => removeSection(section.id)}
                                                onUpdateSettings={(sets: any) => updateSectionSettings(section.id, sets)}
                                                onUpdateBlock={(bid: string, updates: any) => updateBlock(section.id, bid, updates)}
                                                onRemoveBlock={(bid: string) => removeBlock(section.id, bid)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </SortableContext>
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

function DraggableBlockButton({ icon, label, type, active }: { icon: React.ReactNode, label: string, type: BlockType, active?: boolean }) {
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

function SortableSectionItem({ section, active, onSelect, onRemove, onUpdateSettings, onUpdateBlock, onRemoveBlock }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: section.id });

    const { setNodeRef: setDroppableRef } = useDroppable({
        id: `droppable-${section.id}`,
        data: {
            sectionId: section.id,
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        minHeight: section.settings?.height === 'screen' ? 'calc(100vh - 64px)' : 'auto',
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: section.settings?.justifyContent || 'flex-start',
        alignItems: section.settings?.alignItems || 'stretch',
    };

    return (
        <div 
            ref={setNodeRef} 
            style={{
                backgroundImage: section.settings.backgroundImage ? `url(${section.settings.backgroundImage})` : 'none',
                backgroundColor: section.settings.backgroundColor || 'transparent',
                paddingTop: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                paddingBottom: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                ...style,
            }}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            className={cn(
                "relative group rounded-[32px] border-2 transition-all overflow-hidden",
                active ? "border-blue-500 ring-4 ring-blue-500/10 shadow-xl" : "border-transparent hover:border-slate-200",
                "bg-cover bg-center"
            )}
        >
            {/* Section Controls */}
            <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full shadow-lg bg-white/90">
                            <Settings className="h-4 w-4 text-slate-600" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-6 rounded-[24px] shadow-2xl border-slate-100" side="left" align="start">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-sm">Configuração da Seção</h4>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onRemove}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Alinhamento do Conteúdo</Label>
                                    <div className="space-y-4 pt-2">
                                        <div className="space-y-2">
                                            <Label className="text-[9px] text-slate-500 uppercase">Vertical</Label>
                                            <div className="grid grid-cols-3 gap-1">
                                                {(['flex-start', 'center', 'flex-end'] as const).map((a) => (
                                                    <Button
                                                        key={a}
                                                        variant={(section.settings.alignItems || 'flex-start') === a ? 'secondary' : 'outline'}
                                                        size="sm"
                                                        className="text-[9px] h-7 px-1 uppercase"
                                                        onClick={() => onUpdateSettings({ alignItems: a })}
                                                    >
                                                        {a === 'flex-start' ? 'Topo' : a === 'center' ? 'Meio' : 'Base'}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[9px] text-slate-500 uppercase">Horizontal</Label>
                                            <div className="grid grid-cols-3 gap-1">
                                                {(['flex-start', 'center', 'flex-end'] as const).map((j) => (
                                                    <Button
                                                        key={j}
                                                        variant={(section.settings.justifyContent || 'flex-start') === j ? 'secondary' : 'outline'}
                                                        size="sm"
                                                        className="text-[9px] h-7 px-1 uppercase"
                                                        onClick={() => onUpdateSettings({ justifyContent: j })}
                                                    >
                                                        {j === 'flex-start' ? 'Esq' : j === 'center' ? 'Centro' : 'Dir'}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <ImageUpload 
                                    label="Imagem de Fundo"
                                    value={section.settings.backgroundImage}
                                    onChange={(url) => onUpdateSettings({ backgroundImage: url })}
                                />

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Altura da Seção</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['auto', 'screen'] as const).map((h) => (
                                            <Button
                                                key={h}
                                                variant={(section.settings.height || 'auto') === h ? 'secondary' : 'outline'}
                                                size="sm"
                                                className="text-[10px] h-8 rounded-lg capitalize"
                                                onClick={() => onUpdateSettings({ height: h })}
                                            >
                                                {h === 'auto' ? 'Automática' : 'Tela Cheia'}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Largura do Conteúdo</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['1200', '1400', 'full'] as const).map((w) => (
                                            <Button
                                                key={w}
                                                variant={(section.settings.maxWidth || '1400') === w ? 'secondary' : 'outline'}
                                                size="sm"
                                                className="text-[10px] h-8 rounded-lg"
                                                onClick={() => onUpdateSettings({ maxWidth: w })}
                                            >
                                                {w === 'full' ? 'Total' : `${w}px`}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Espaçamento Vertical</Label>
                                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold">{section.settings.paddingY || '12'}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="40" step="1"
                                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        value={section.settings.paddingY || '12'}
                                        onChange={(e) => onUpdateSettings({ paddingY: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Cor de Fundo</Label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="color" 
                                            className="h-8 w-8 rounded-lg overflow-hidden border-none p-0 cursor-pointer bg-transparent"
                                            value={section.settings.backgroundColor || '#ffffff'}
                                            onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                                        />
                                        <Input 
                                            className="h-8 text-xs rounded-lg flex-1 bg-slate-50 border-none font-mono" 
                                            value={section.settings.backgroundColor || '#ffffff'}
                                            onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <div {...attributes} {...listeners} className="h-9 w-9 rounded-full shadow-lg bg-white/90 flex items-center justify-center cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </div>
            </div>

            <div ref={setDroppableRef} className="relative z-10 space-y-4 px-8 w-full">
                <SortableContext 
                    items={section.blocks.map((b: Block) => b.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {section.blocks.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl opacity-40">
                            <Plus className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">Seção vazia.<br/>Arraste componentes para cá.</p>
                        </div>
                    )}
                    {section.blocks.map((block: Block) => (
                        <SortableBlockItem 
                            key={block.id} 
                            block={block} 
                            sectionId={section.id}
                            onUpdate={(content: any) => onUpdateBlock(block.id, content)}
                            onRemove={() => onRemoveBlock(block.id)}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    );
}

function SortableBlockItem({ block, sectionId, onUpdate, onRemove }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ 
        id: block.id,
        data: {
            type: 'existing-block',
            sectionId: sectionId
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style}
            key={block.settings?.animation || 'static'} 
            className={cn(
                "group/block relative p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100",
                block.settings?.animation === 'fade-up' && 'animate-fade-up',
                block.settings?.animation === 'zoom-in' && 'animate-zoom-in',
                block.settings?.animation === 'fade-left' && 'animate-fade-left',
                block.settings?.animation === 'fade-right' && 'animate-fade-right'
            )}
        >
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/block:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-40 bg-white shadow-sm border border-slate-100 rounded-lg p-1" {...attributes} {...listeners}>
                <GripVertical className="h-3 w-3 text-slate-400" />
            </div>
            <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 group-hover/block:opacity-100 transition-opacity z-30">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-white shadow-sm border border-slate-100">
                            <Settings className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-4 rounded-2xl shadow-xl border-slate-100" side="left">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold">Altura do Bloco</Label>
                                <div className="grid grid-cols-2 gap-1">
                                    {['auto', 'sm', 'md', 'lg', 'screen'].map((h) => (
                                        <Button 
                                            key={h} 
                                            variant={(block.settings?.height || 'auto') === h ? 'secondary' : 'outline'}
                                            size="sm" 
                                            className="text-[10px] h-7"
                                            onClick={() => onUpdate({ settings: { height: h } })}
                                        >
                                            {h}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                 <Label className="text-[10px] uppercase text-slate-400 font-bold">Animação de Entrada</Label>
                                 <Select 
                                    value={block.settings?.animation || 'none'} 
                                    onValueChange={(val) => onUpdate({ settings: { animation: val } })}
                                 >
                                     <SelectTrigger className="h-7 text-[10px] rounded-lg">
                                         <SelectValue placeholder="Escolha" />
                                     </SelectTrigger>
                                     <SelectContent>
                                         <SelectItem value="none">Nenhuma</SelectItem>
                                         <SelectItem value="fade-up">Subir Suave</SelectItem>
                                         <SelectItem value="zoom-in">Zoom In</SelectItem>
                                         <SelectItem value="fade-left">Vindo da Esquerda</SelectItem>
                                         <SelectItem value="fade-right">Vindo da Direita</SelectItem>
                                     </SelectContent>
                                 </Select>
                             </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold">Alinhamento</Label>
                                <div className="flex gap-1">
                                    {(['left', 'center', 'right'] as const).map((a) => (
                                        <Button 
                                            key={a} 
                                            variant={(block.settings?.textAlign || 'left') === a ? 'secondary' : 'outline'}
                                            size="sm" 
                                            className="text-[10px] h-7 flex-1"
                                            onClick={() => onUpdate({ settings: { textAlign: a } })}
                                        >
                                            <AlignCenter className={cn("h-3 w-3", a === 'left' && "-rotate-90", a === 'right' && "rotate-90")} />
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <Button 
                    variant="ghost" size="icon" 
                    className="h-7 w-7 rounded-full bg-white shadow-sm border border-slate-100"
                    onClick={onRemove}
                >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
            </div>

            {block.type === 'header' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-white/50 p-4 rounded-xl">
                        <Input 
                            className="w-auto font-black text-lg border-none bg-transparent p-0 h-auto"
                            value={block.content.logoText}
                            onChange={(e) => onUpdate({ logoText: e.target.value })}
                        />
                        <div className="flex-1 flex gap-4">
                            {(block.content.links || []).map((link: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1 group/link">
                                    <Input 
                                        className="w-20 text-xs font-bold border-none bg-transparent p-0 h-auto text-slate-600"
                                        value={link.label}
                                        onChange={(e) => {
                                            const links = [...block.content.links];
                                            links[idx].label = e.target.value;
                                            onUpdate({ links });
                                        }}
                                    />
                                    <button 
                                        className="opacity-0 group-hover/link:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                                        onClick={() => {
                                            const links = block.content.links.filter((_: any, i: number) => i !== idx);
                                            onUpdate({ links });
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] rounded-full" onClick={() => {
                                const links = [...(block.content.links || [])];
                                links.push({ label: 'Novo Item', url: '#' });
                                onUpdate({ links });
                            }}>+ Link</Button>
                        </div>
                        <Input 
                            className="w-24 text-center text-[10px] font-black uppercase tracking-widest border-none bg-slate-900 text-white rounded-lg h-8"
                            value={block.content.cta?.label}
                            onChange={(e) => onUpdate({ cta: { ...block.content.cta, label: e.target.value } })}
                        />
                    </div>
                </div>
            )}

            {block.type === 'hero' && (
                <div className={cn(
                    "py-6",
                    block.settings?.textAlign === 'left' ? "text-left" :
                    block.settings?.textAlign === 'right' ? "text-right" : "text-center"
                )}>
                    <Input 
                        className="text-4xl font-black text-center border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-2 h-auto mb-2 rounded-xl"
                        value={block.content.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                    />
                    <Input 
                        className="text-lg text-slate-500 text-center border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-2 h-auto rounded-xl"
                        value={block.content.subtitle}
                        onChange={(e) => onUpdate({ subtitle: e.target.value })}
                    />
                </div>
            )}

            {block.type === 'text' && (
                <textarea 
                    className={cn(
                        "w-full min-h-[80px] border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-3 rounded-xl resize-none text-slate-700 font-medium transition-all",
                        block.settings?.textAlign === 'center' && "text-center",
                        block.settings?.textAlign === 'right' && "text-right"
                    )}
                    value={block.content.text}
                    onChange={(e) => onUpdate({ text: e.target.value })}
                />
            )}

            {block.type === 'image' && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Largura da Imagem</Label>
                            <span className="text-[10px] font-bold text-blue-600">{block.settings?.imageWidth || '100'}%</span>
                        </div>
                        <Slider
                            value={[parseInt(block.settings?.imageWidth || '100')]}
                            min={10}
                            max={100}
                            step={1}
                            onValueChange={([val]) => onUpdate({ settings: { imageWidth: val.toString() } })}
                        />
                    </div>
                    <div className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Link de Destino (Opcional)</Label>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="https://..." 
                                className="h-9 rounded-xl text-xs"
                                value={block.settings?.targetUrl || ''}
                                onChange={(e) => onUpdate({ settings: { targetUrl: e.target.value } })}
                            />
                            {block.settings?.targetUrl && (
                                <div className="flex items-center justify-center h-9 w-9 bg-blue-50 text-blue-600 rounded-xl">
                                    <LinkIcon className="h-4 w-4" />
                                </div>
                            )}
                        </div>
                    </div>
                    {block.content.url ? (
                        <div 
                            className={cn(
                                "relative aspect-video rounded-2xl overflow-hidden border border-slate-100 group/img transition-all duration-300",
                                block.settings?.textAlign === 'left' ? "mr-auto" : 
                                block.settings?.textAlign === 'right' ? "ml-auto" : "mx-auto"
                            )}
                            style={{ width: `${block.settings?.imageWidth || '100'}%` }}
                        >
                            <img src={block.content.url} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                <Button variant="secondary" size="sm" onClick={() => onUpdate({ url: '' })}>Trocar Imagem</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-3">
                            <div className="p-4 rounded-full bg-slate-50">
                                <ImageIcon className="h-8 w-8 text-slate-200" />
                            </div>
                            <ImageUpload 
                                label="Fazer Upload da Imagem"
                                value=""
                                onChange={(url) => onUpdate({ url })}
                            />
                        </div>
                    )}
                </div>
            )}

            {block.type === 'html' && (
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Custom HTML/CSS</Label>
                    <textarea 
                        className="w-full min-h-[120px] font-mono text-xs border border-slate-200 bg-slate-900 text-green-400 p-3 rounded-xl resize-none"
                        value={block.content.html}
                        onChange={(e) => onUpdate({ html: e.target.value })}
                    />
                </div>
            )}

            {block.type === 'links' && (
                <div className="flex flex-col items-center gap-3 py-4 w-full max-w-sm mx-auto">
                    {(block.content.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="w-full flex items-center gap-2">
                            <Input 
                                className="flex-1 h-12 bg-slate-900 text-white rounded-xl text-center font-bold"
                                value={item.label}
                                onChange={(e) => {
                                    const items = [...block.content.items];
                                    items[idx].label = e.target.value;
                                    onUpdate({ items });
                                }}
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => {
                                const items = block.content.items.filter((_: any, i: number) => i !== idx);
                                onUpdate({ items });
                            }}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="rounded-full h-8 px-4" onClick={() => {
                        const items = [...(block.content.items || [])];
                        items.push({ label: 'Novo Botão', url: '#' });
                        onUpdate({ items });
                    }}>+ Adicionar Botão</Button>
                </div>
            )}

            {block.type === 'slider' && (
                <div className="space-y-4">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Premium Slider</Label>
                    {(block.content.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold">SLIDE {idx + 1}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => {
                                    const items = block.content.items.filter((_: any, i: number) => i !== idx);
                                    onUpdate({ items });
                                }}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                            <Input 
                                placeholder="Título" 
                                className="h-8 text-sm" 
                                value={item.title} 
                                onChange={(e) => {
                                    const items = [...block.content.items];
                                    items[idx].title = e.target.value;
                                    onUpdate({ items });
                                }}
                            />
                            <Input 
                                placeholder="Subtítulo" 
                                className="h-8 text-xs text-slate-500" 
                                value={item.subtitle} 
                                onChange={(e) => {
                                    const items = [...block.content.items];
                                    items[idx].subtitle = e.target.value;
                                    onUpdate({ items });
                                }}
                            />
                            <ImageUpload 
                                label="Imagem do Banner"
                                value={item.image}
                                onChange={(url) => {
                                    const items = [...block.content.items];
                                    items[idx].image = url;
                                    onUpdate({ items });
                                }}
                            />
                        </div>
                    ))}
                    <Button variant="outline" className="w-full h-10 rounded-xl gap-2 dashed" onClick={() => {
                        const items = [...(block.content.items || [])];
                        items.push({ title: 'Novo Slide', subtitle: 'Texto aqui', image: '' });
                        onUpdate({ items });
                    }}>
                        <Plus className="h-4 w-4" /> Adicionar Slide
                    </Button>
                </div>
            )}

            {block.type === 'info-cards' && (
                <div className="space-y-4">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Info Cards (Notícias)</Label>
                    {(block.content.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold">CARD {idx + 1}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => {
                                    const items = block.content.items.filter((_: any, i: number) => i !== idx);
                                    onUpdate({ items });
                                }}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Input 
                                    placeholder="Data" 
                                    className="h-8 text-xs" 
                                    value={item.date} 
                                    onChange={(e) => {
                                        const items = [...block.content.items];
                                        items[idx].date = e.target.value;
                                        onUpdate({ items });
                                    }}
                                />
                                <Input 
                                    placeholder="Label Botão" 
                                    className="h-8 text-xs" 
                                    value={item.title} 
                                    onChange={(e) => {
                                        const items = [...block.content.items];
                                        items[idx].title = e.target.value;
                                        onUpdate({ items });
                                    }}
                                />
                            </div>
                            <textarea 
                                placeholder="Chamada/Texto" 
                                className="w-full text-xs p-2 rounded-lg border bg-white min-h-[60px]" 
                                value={item.text} 
                                onChange={(e) => {
                                    const items = [...block.content.items];
                                    items[idx].text = e.target.value;
                                    onUpdate({ items });
                                }}
                            />
                            <ImageUpload 
                                label="Imagem do Card"
                                value={item.image}
                                onChange={(url) => {
                                    const items = [...block.content.items];
                                    items[idx].image = url;
                                    onUpdate({ items });
                                }}
                            />
                        </div>
                    ))}
                    <Button variant="outline" className="w-full h-10 rounded-xl gap-2 dashed" onClick={() => {
                        const items = [...(block.content.items || [])];
                        items.push({ title: 'Explore', date: 'Date here', text: 'Text here', image: '' });
                        onUpdate({ items });
                    }}>
                        <Plus className="h-4 w-4" /> Adicionar Card
                    </Button>
                </div>
            )}
            {block.type === 'grid' && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase">Configuração da Grade</Label>
                            <Select 
                                value={String(block.content.columns || 2)} 
                                onValueChange={(val) => onUpdate({ columns: parseInt(val) })}
                            >
                                <SelectTrigger className="h-8 w-24 rounded-lg text-xs">
                                    <SelectValue placeholder="Colunas" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[1, 2, 3, 4].map(v => <SelectItem key={v} value={String(v)}>{v} Col</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[9px] text-slate-500 uppercase">Direção</Label>
                                <div className="flex gap-1">
                                    {(['row', 'col'] as const).map((d) => (
                                        <Button
                                            key={d}
                                            variant={(block.settings?.direction || 'row') === d ? 'secondary' : 'outline'}
                                            size="sm"
                                            className="text-[9px] h-7 flex-1 uppercase"
                                            onClick={() => onUpdate({ settings: { direction: d } })}
                                        >
                                            {d === 'row' ? 'Horiz' : 'Vert'}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] text-slate-500 uppercase">Distribuição</Label>
                                <div className="flex gap-1">
                                    {(['start', 'center', 'between'] as const).map((a) => (
                                        <Button
                                            key={a}
                                            variant={(block.settings?.alignment || 'start') === a ? 'secondary' : 'outline'}
                                            size="sm"
                                            className="text-[9px] h-7 flex-1 uppercase"
                                            onClick={() => onUpdate({ settings: { alignment: a } })}
                                        >
                                            {a === 'start' ? 'Esq' : a === 'center' ? 'Meio' : 'Esp'}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={cn(
                        "grid gap-4 min-h-[100px] border-2 border-dashed border-slate-100 rounded-2xl p-4 w-full",
                        block.settings?.direction === 'col' ? "flex flex-col" : (
                            block.content.columns === 1 || block.content.columns === undefined ? "grid-cols-1" :
                            block.content.columns === 2 ? "grid-cols-2" :
                            block.content.columns === 3 ? "grid-cols-3" :
                            "grid-cols-4"
                        ),
                        block.settings?.alignment === 'center' ? (block.settings?.direction === 'col' ? "items-center" : "items-center justify-items-center") :
                        block.settings?.alignment === 'between' ? (block.settings?.direction === 'col' ? "justify-between" : "justify-between") :
                        block.settings?.alignment === 'end' ? (block.settings?.direction === 'col' ? "items-end" : "items-end justify-items-end") : ""
                    )}>
                        {(block.blocks || []).map((innerBlock: Block) => (
                            <SortableBlockItem 
                                key={innerBlock.id} 
                                block={innerBlock}
                                onUpdate={(innerUpdates: any) => {
                                    const blocks = block.blocks?.map(b => {
                                        if (b.id !== innerBlock.id) return b;
                                        const { settings, blocks: subBlocks, ...innerContent } = innerUpdates;
                                        let nb = { ...b };
                                        if (settings) nb.settings = { ...(nb.settings || {}), ...settings };
                                        if (subBlocks) nb.blocks = subBlocks;
                                        if (Object.keys(innerContent).length > 0) nb.content = { ...(nb.content || {}), ...innerContent };
                                        return nb;
                                    });
                                    onUpdate({ blocks });
                                }}
                                onRemove={() => {
                                    const blocks = block.blocks?.filter(b => b.id !== innerBlock.id);
                                    onUpdate({ blocks });
                                }}
                            />
                        ))}
                        <Button 
                            variant="ghost" 
                            className="h-full min-h-[120px] rounded-xl border-dashed border-2 flex-col gap-1 text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-all"
                            onClick={() => {
                                const newInner: Block = { id: Math.random().toString(36).substr(2, 9), type: 'text', content: { text: 'Novo Bloco' } };
                                const blocks = [...(block.blocks || []), newInner];
                                onUpdate({ blocks });
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            <span className="text-[10px]">Novo Bloco</span>
                        </Button>
                    </div>
                </div>
            )}

            {block.type === 'gallery' && (
                <div className="space-y-4">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Galeria de Imagens</Label>
                    <div className="grid grid-cols-4 gap-3">
                        {(block.content.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group/item border border-slate-100">
                                {item.url ? (
                                    <img src={item.url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                        <ImageIcon className="h-4 w-4 text-slate-200" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:text-red-400" onClick={() => {
                                        const items = block.content.items.filter((_: any, i: number) => i !== idx);
                                        onUpdate({ items });
                                    }}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        <div className="aspect-square">
                            <ImageUpload 
                                label="+"
                                value=""
                                onChange={(url) => {
                                    const items = [...(block.content.items || []), { url }];
                                    onUpdate({ items });
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
