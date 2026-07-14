
                    <SortableContext items={layoutOrder} strategy={verticalListSortingStrategy}>
                        {layoutOrder.map((id) => {
                            const customSection = sections.find(s => s.id === id);
                            if (customSection) {
                                return (
                                    <SortableSectionItem
                                        key={customSection.id}
                                        section={customSection}
                                        previewMode={previewMode}
                                        active={activeSectionId === customSection.id}
                                        onSelect={() => setActiveSectionId(customSection.id)}
                                        onRemove={() => handleDeleteSection(customSection.id)}
                                        onUpdate={(updates) => handleUpdateSection(customSection.id, updates)}
                                        onAddBlock={(type) => {
                                            const newBlock: Block = {
                                                id: Math.random().toString(36).substr(2, 9),
                                                type,
                                                content: type === 'text' || type === 'header' ? { text: 'Novo Bloco' } :
                                                        type === 'gallery' ? { images: [] } :
                                                        type === 'form' ? { fields: [] } :
                                                        type === 'image' ? { url: '' } :
                                                        type === 'slider' ? { slides: [] } :
                                                        type === 'button' ? { label: 'Clique Aqui', url: '#' } :
                                                        type === 'grid' ? { columns: 2 } :
                                                        type === 'pdf' ? { url: '', title: 'Documento PDF' } : {}
                                            };
                                            const updatedBlocks = [...(customSection.blocks || []), newBlock];
                                            handleUpdateSection(customSection.id, { blocks: updatedBlocks });
                                        }}
                                    />
                                );
                            } else {
                                return (
                                    <SortableFixedSectionItem key={id} id={id} previewMode={previewMode}>
                                        <AgroForteRenderer data={agroforteData!} sectionToRender={id} editMode={true} onSelectElement={setSelectedElementId} />
                                    </SortableFixedSectionItem>
                                );
                            }
                        })}
                    </SortableContext>

            <div 
                onClick={() => addSection()}
                className="border-2 border-dashed border-blue-200 bg-slate-50/50 hover:bg-slate-50 transition-colors mx-8 mt-4 p-12 rounded-[32px] flex flex-col items-center justify-center cursor-pointer group"
            >
                <div className="h-14 w-14 rounded-full bg-blue-100 group-hover:bg-blue-600 transition-colors flex items-center justify-center shadow-sm mb-4">
                    <Plus className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Adicionar Nova Seção</p>
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
                        <AgroForteEditor
                            data={agroforteData}
                            onChange={(d) => setAgroforteData(d)}
                            activeElementId={activeElementId}
                            onBack={() => setActiveElementId(null)}
                            renderCustomBlocksPanel={() => customBlocksPanel}
                        />
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
            <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => navigate('/app/portal')}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="font-semibold">Editor de Portal</h2>
                </div>
                
                <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Componentes & Blocos</p>
                    {customBlocksPanel}

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


function SortableFixedSectionItem({ id, children, previewMode }: { id: string, children: React.ReactNode, previewMode: string }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative group/fixed-section border-2 border-transparent hover:border-blue-500 rounded-[32px] transition-all overflow-hidden mb-8">
            <div 
                {...attributes} 
                {...listeners} 
                className="absolute right-6 top-0 z-50 bg-blue-500 text-white rounded-b-xl shadow-lg flex items-center h-8 opacity-0 group-hover/fixed-section:opacity-100 transition-opacity translate-y-[-100%] group-hover/fixed-section:translate-y-0"
            >
                <div className="px-3 h-full flex items-center text-[10px] font-bold uppercase tracking-widest border-r border-blue-400/50">
                    Seção Fixa
                </div>
                <div className="p-1.5 px-3 hover:bg-blue-600 transition-colors cursor-grab active:cursor-grabbing" title="Arrastar Seção">
                    <GripVertical className="h-4 w-4" />
                </div>
            </div>
            <div className="pointer-events-none">
                {children}
            </div>
        </div>
    );
}

function SortableSectionItem({ section, previewMode, active, onSelect, onRemove, onUpdateSettings, onUpdateBlock, onRemoveBlock, onAddSectionAbove }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: section.id });

    const effectiveSettings = getEffectiveSettings(section.settings, section.mobileSettings, previewMode);

    const { setNodeRef: setDroppableRef } = useDroppable({
        id: `droppable-${section.id}`,
        data: {
            sectionId: section.id,
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        minHeight: effectiveSettings.height === 'screen' ? 'calc(100vh - 64px)' : 'auto',
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: effectiveSettings.alignItems || 'flex-start', // alignItems is actually vertical in flex-col
        alignItems: effectiveSettings.justifyContent || 'stretch', // justifyContent is actually horizontal in flex-col
    };

    return (
        <div 
            ref={setNodeRef} 
            id={`section-${section.id}`}
            style={{
                backgroundImage: effectiveSettings.backgroundImage ? `url(${effectiveSettings.backgroundImage})` : 'none',
                backgroundColor: effectiveSettings.backgroundColor || 'transparent',
                paddingTop: `${(Number(effectiveSettings.paddingY) || 0) * 4}px`,
                paddingBottom: `${(Number(effectiveSettings.paddingY) || 0) * 4}px`,
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
            {/* Section Elementor Toolbar */}
            <div className="absolute left-1/2 -top-0 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center bg-blue-500 text-white rounded-b-lg shadow-lg overflow-hidden">
                <button 
                    className="p-1.5 px-3 hover:bg-blue-600 transition-colors border-r border-blue-400/50"
                    onClick={(e) => { e.stopPropagation(); onAddSectionAbove?.(); }}
                    title="Adicionar Seção Acima"
                >
                    <Plus className="h-4 w-4" />
                </button>
                <div 
                    {...attributes} 
                    {...listeners} 
                    className="p-1.5 px-3 hover:bg-blue-600 transition-colors cursor-grab active:cursor-grabbing border-r border-blue-400/50"
                    title="Arrastar Seção"
                    onClick={(e) => { e.stopPropagation(); onSelect(); }}
                >
                    <GripVertical className="h-4 w-4" />
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <button 
                            className="p-1.5 px-3 hover:bg-blue-600 transition-colors border-r border-blue-400/50"
                            onClick={(e) => { e.stopPropagation(); }}
                            title="Configurações da Seção"
                        >
                            <Settings className="h-4 w-4" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[95vw] sm:w-[380px] max-h-[80vh] overflow-y-auto p-6 rounded-[24px] shadow-2xl border-slate-100" side="bottom" align="center" sideOffset={10}>
                        <div className="space-y-6">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-0.5 flex-1 min-w-0">
                                    <h4 className="font-bold text-sm truncate leading-tight">Configuração da Seção</h4>
                                    <p className="text-[10px] text-blue-500 font-bold uppercase truncate">{previewMode === 'mobile' ? 'Editando Mobile 📱' : 'Editando Desktop 🖥️'}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-red-500 hover:bg-red-50 hover:text-red-600 focus:ring-2 focus:ring-red-500" onClick={onRemove}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Alinhamento do Conteúdo</Label>
                                    <div className="space-y-4 pt-2">
                                        <div className="space-y-2">
                                            <Label className="text-[9px] text-slate-500 uppercase">Vertical (Alinhamento)</Label>
                                            <div className="grid grid-cols-3 gap-1">
                                                {(['flex-start', 'center', 'flex-end'] as const).map((a) => (
                                                    <Button
                                                        key={a}
                                                        variant={(effectiveSettings.alignItems || 'flex-start') === a ? 'secondary' : 'outline'}
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
                                            <Label className="text-[9px] text-slate-500 uppercase">Horizontal (Distribuição)</Label>
                                            <div className="grid grid-cols-4 gap-1">
                                                {(['flex-start', 'center', 'flex-end', 'stretch'] as const).map((j) => (
                                                    <Button
                                                        key={j}
                                                        variant={(effectiveSettings.justifyContent || 'flex-start') === j ? 'secondary' : 'outline'}
                                                        size="sm"
                                                        className="text-[9px] h-7 px-1 uppercase"
                                                        onClick={() => onUpdateSettings({ justifyContent: j })}
                                                    >
                                                        {j === 'flex-start' ? 'Esq' : j === 'center' ? 'Centro' : j === 'flex-end' ? 'Dir' : 'Total'}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <ImageUpload 
                                    label="Imagem de Fundo"
                                    value={effectiveSettings.backgroundImage}
                                    onChange={(url) => onUpdateSettings({ backgroundImage: url })}
                                />

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Altura da Seção</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['auto', 'screen'] as const).map((h) => (
                                            <Button
                                                key={h}
                                                variant={(effectiveSettings.height || 'auto') === h ? 'secondary' : 'outline'}
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
                                                variant={(effectiveSettings.maxWidth || '1400') === w ? 'secondary' : 'outline'}
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
                                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold">{effectiveSettings.paddingY || '12'}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="40" step="1"
                                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        value={effectiveSettings.paddingY || '12'}
                                        onChange={(e) => onUpdateSettings({ paddingY: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Cor de Fundo</Label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="color" 
                                            className="h-8 w-8 rounded-lg overflow-hidden border-none p-0 cursor-pointer bg-transparent"
                                            value={effectiveSettings.backgroundColor || '#ffffff'}
                                            onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                                        />
                                        <Input 
                                            className="h-8 text-xs rounded-lg flex-1 bg-slate-50 border-none font-mono" 
                                            value={effectiveSettings.backgroundColor || '#ffffff'}
                                            onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <button 
                    className="p-1.5 px-3 hover:bg-red-500 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    title="Excluir Seção"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <div ref={setDroppableRef} className="relative z-10 space-y-4 px-8 w-full">
                <SortableContext 
                    items={section.blocks.map((b: Block) => b.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {section.blocks.length === 0 && (
                        <div className="py-16 mx-12 text-center border-2 border-dashed border-slate-300 bg-white/50 rounded-2xl opacity-70">
                            <Plus className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Arraste o widget para cá</p>
                        </div>
                    )}
                    {section.blocks.map((block: Block) => (
                        <SortableBlockItem 
                            key={block.id} 
                            block={block} 
                            sectionId={section.id}
                            previewMode={previewMode}
                            onUpdate={(content: any) => onUpdateBlock(block.id, content)}
                            onRemove={() => onRemoveBlock(block.id)}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    );
}

function SortableBlockItem({ block, sectionId, previewMode, onUpdate, onRemove, isNested }: any) {
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
        },
        disabled: isNested
    });

    const effectiveSettings = getEffectiveSettings(block.settings, block.mobileSettings, previewMode);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    return (
        <div 
            ref={setNodeRef} 
            id={`block-${block.id}`}
            style={style}
            key={effectiveSettings.animation || 'static'} 
            className={cn(
                isNested ? "group/innerblock relative p-2 hover:bg-slate-50 border-2 border-transparent hover:border-blue-200/50" : "group/block relative p-4 rounded-2xl hover:bg-slate-50 transition-all border-2 border-transparent hover:border-blue-200/50",
                effectiveSettings.animation === 'fade-up' && 'animate-fade-up',
                effectiveSettings.animation === 'zoom-in' && 'animate-zoom-in',
                effectiveSettings.animation === 'fade-left' && 'animate-fade-left',
                effectiveSettings.animation === 'fade-right' && 'animate-fade-right'
            )}
        >
            <div className={cn(
                "absolute opacity-0 transition-opacity z-50 flex items-center bg-blue-500 text-white shadow-lg overflow-hidden",
                isNested ? "right-2 top-2 rounded-lg group-hover/innerblock:opacity-100" : "right-0 top-0 rounded-bl-lg rounded-tr-xl group-hover/block:opacity-100"
            )}>
                <Popover>
                    <PopoverTrigger asChild>
                        <button className="p-1.5 hover:bg-blue-600 transition-colors border-r border-blue-400/50" title="Editar Widget">
                            <Settings className="h-3 w-3" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] max-h-[80vh] overflow-y-auto p-4 rounded-2xl shadow-xl border-slate-100" side="left">
                        <div className="space-y-4">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold">Configuração do Bloco</Label>
                                <p className="text-[9px] text-blue-500 font-bold uppercase">{previewMode === 'mobile' ? 'Editando Mobile 📱' : 'Editando Desktop 🖥️'}</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold">Altura do Bloco</Label>
                                <div className="grid grid-cols-2 gap-1">
                                    {['auto', 'sm', 'md', 'lg', 'screen'].map((h) => (
                                        <Button 
                                            key={h} 
                                            variant={(effectiveSettings.height || 'auto') === h ? 'secondary' : 'outline'}
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
                                    value={effectiveSettings.animation || 'none'} 
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
                                            variant={(effectiveSettings.textAlign || 'left') === a ? 'secondary' : 'outline'}
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
                        <div className="pt-4 mt-4 border-t border-slate-100 space-y-4">


            {block.type === 'header' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-white/50 p-4 rounded-xl">
                        <Input 
                            className="w-auto font-black text-lg border-none bg-transparent p-0 h-auto"
                            value={block.content.logoText}
                            onChange={(e) => onUpdate({ logoText: e.target.value })}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
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
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
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
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}

            {block.type === 'hero' && (
                <div className={cn(
                    "py-6 space-y-4",
                    effectiveSettings.textAlign === 'left' ? "text-left" :
                    effectiveSettings.textAlign === 'right' ? "text-right" : "text-center"
                )}>
                    <Input 
                        className="text-4xl font-black text-center border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-2 h-auto mb-2 rounded-xl"
                        value={block.content.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div 
                        className="max-w-2xl mx-auto"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <RichTextEditor 
                            value={block.content.subtitle}
                            onChange={(html) => onUpdate({ subtitle: html })}
                            placeholder="Adicione um subtítulo com formatação..."
                            className="border-none bg-transparent shadow-none"
                            editorClassName="text-center text-lg text-slate-500"
                            minHeightClassName="min-h-0"
                        />
                    </div>
                </div>
            )}

            {block.type === 'text' && (
                <div 
                    className="w-full"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <RichTextEditor 
                        value={block.content.text}
                        onChange={(html) => onUpdate({ text: html })}
                        placeholder="Escreva seu texto aqui..."
                        className="border-none bg-transparent shadow-none"
                        editorClassName={cn(
                            "text-slate-700 font-medium",
                            effectiveSettings.textAlign === 'center' && "text-center",
                            effectiveSettings.textAlign === 'right' && "text-right"
                        )}
                        minHeightClassName="min-h-[100px]"
                    />
                </div>
            )}

            {block.type === 'image' && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Largura da Imagem</Label>
                            <span className="text-[10px] font-bold text-blue-600">{effectiveSettings.imageWidth || '100'}%</span>
                        </div>
                        <Slider
                            value={[parseInt(effectiveSettings.imageWidth || '100')]}
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
                                value={effectiveSettings.targetUrl || ''}
                                onChange={(e) => onUpdate({ settings: { targetUrl: e.target.value } })}
                                onPointerDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
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
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
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
                                onPointerDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
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
                                onPointerDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
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
                                onPointerDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
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
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
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
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                />
                            </div>
                            <div onPointerDown={(e) => e.stopPropagation()}>
                                <RichTextEditor 
                                    value={item.text}
                                    onChange={(html) => {
                                        const items = [...block.content.items];
                                        items[idx].text = html;
                                        onUpdate({ items });
                                    }}
                                    placeholder="Descrição da notícia..."
                                    editorClassName="text-xs"
                                    minHeightClassName="min-h-[60px]"
                                />
                            </div>
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
                                            variant={(effectiveSettings.direction || 'row') === d ? 'secondary' : 'outline'}
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
                                            variant={(effectiveSettings.alignment || 'start') === a ? 'secondary' : 'outline'}
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
                    </PopoverContent>
                </Popover>

                {!isNested && (
                    <div {...attributes} {...listeners} className="p-1.5 hover:bg-blue-600 transition-colors cursor-grab active:cursor-grabbing border-r border-blue-400/50">
                        <GripVertical className="h-3 w-3" />
                    </div>
                )}
                <button 
                    className="p-1.5 hover:bg-red-500 transition-colors" 
                    onClick={(e) => { e.stopPropagation(); onRemove(); }} 
                    title="Excluir Widget"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            </div>
            {/* VISUAL PREVIEW */}
            <div className="mt-2">
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
                                const blocks = block.blocks?.map((b: any) => {
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
                                const blocks = block.blocks?.filter((b: any) => b.id !== innerBlock.id);
                                onUpdate({ blocks });
                            }}
                        />
                    )}
                />
            </div>
        </div>
    );
}
