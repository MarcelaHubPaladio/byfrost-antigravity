import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { 
  Type, 
  Image as ImageIcon, 
  Square, 
  Save, 
  Download, 
  Trash2, 
  Layers, 
  ChevronLeft,
  Search,
  Check,
  Smartphone,
  Monitor,
  Palette,
  Layout,
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { MediaKitCanvas, Layer } from "@/components/media-kit/MediaKitCanvas";
import { MediaKitGallery } from "@/components/media-kit/MediaKitGallery";
import { MediaKitLayers } from "@/components/media-kit/MediaKitLayers";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";

export default function MediaKitEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const canvasRefs = useRef<{ [key: string]: any }>({});
  const pageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const initialEntityId = searchParams.get("entityId");

  const [editorState, setEditorState] = useState<"setup" | "editing">(id === "new" ? "setup" : "editing");
  const mode = searchParams.get("mode") || "kit"; // "kit" or "mask"
  const [name, setName] = useState(mode === "mask" ? "Nova Máscara" : "Novo Mídia Kit");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<any>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [creationMode, setCreationMode] = useState<"related" | "free">("related");
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  
  // Multi-page config
  const [pages, setPages] = useState<{ id: string; templateId: string; layers: Layer[] }[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<{ pageId: string; layerId: string } | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const activePage = pages.find(p => p.id === activePageId);

  const [isEntityDialogOpen, setIsEntityDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [scale, setScale] = useState(0.5);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  
  // History for Undo
  const [history, setHistory] = useState<{ id: string; templateId: string; layers: Layer[] }[][]>([]);

  const templatesQ = useQuery({
    queryKey: ["media_kit_templates", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kit_templates")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
  });

  const kitQ = useQuery({
    queryKey: ["media_resource", mode, id],
    enabled: !!id && id !== "new",
    queryFn: async () => {
      const table = mode === "mask" ? "media_kit_masks" : "media_kits";
      let query = supabase.from(table).select("*");
      
      if (mode === "kit") {
        query = query.select("*, entities:core_entities(*)").eq("id", id!).single() as any;
      } else {
        query = query.eq("id", id!).single() as any;
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Navigation Guard - Unsaved Changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const data = kitQ.data as any;
    if (data) {
      setName(data.name);
      
      if (mode === "kit") {
        setEntityId(data.entity_id);
        setEntityData({
          ...data.entities,
          ...data.entities?.metadata
        });
      }
      
      const config = data.config as any;
      if (config.pages) {
        setPages(config.pages);
        if (config.pages.length > 0) setActivePageId(config.pages[0].id);
      } else if (config.layouts) {
        // Mask format: convert layouts to pages for the editor
        const maskPages = Object.entries(config.layouts).map(([tid, layers], idx) => ({
          id: `page-${idx}-${Date.now()}`,
          templateId: tid,
          layers: layers as Layer[]
        }));
        setPages(maskPages);
        if (maskPages.length > 0) setActivePageId(maskPages[0].id);
      } else if (config.layers) {
        // Migration of old data format
        setPages([{ id: "p1", templateId: "unknown", layers: config.layers }]);
        setActivePageId("p1");
      }
      setEditorState("editing");
    }
  }, [kitQ.data, mode]);

  const initialEntityQ = useQuery({
    queryKey: ["entity_initial", activeTenantId, initialEntityId],
    enabled: !!activeTenantId && !!initialEntityId && id === "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("*")
        .eq("id", initialEntityId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (initialEntityQ.data && !entityId) {
      setEntityId(initialEntityQ.data.id);
      setEntityData({
        ...initialEntityQ.data,
        ...initialEntityQ.data.metadata
      });
    }
  }, [initialEntityQ.data]);

  const entitiesQ = useQuery({
    queryKey: ["entities_search", activeTenantId, searchTerm],
    enabled: !!activeTenantId && (isEntityDialogOpen || editorState === "setup") && creationMode === "related",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .ilike("display_name", `%${searchTerm}%`)
        .is("deleted_at", null)
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const masksQ = useQuery({
    queryKey: ["media_kit_masks", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kit_masks")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const startEditing = () => {
    if (selectedTemplateIds.length === 0) {
      showError("Selecione pelo menos um template.");
      return;
    }

    const mask = masksQ.data?.find(m => m.id === selectedMaskId);
    
    const newPages = selectedTemplateIds.map((tid, idx) => {
      // Apply mask layers if available for this template
      const maskLayers = (mask?.config as any)?.layouts?.[tid] || [];
      
      return {
        id: `page-${idx}-${Date.now()}`,
        templateId: tid,
        layers: maskLayers.length > 0 ? maskLayers : []
      };
    });
    
    setPages(newPages);
    setActivePageId(newPages[0].id);
    setPages(newPages);
    setHistory([newPages]);
    setActivePageId(newPages[0].id);
    setEditorState("editing");
  };

  const pushToHistory = (newPages: typeof pages) => {
    setHistory(prev => {
      const updated = [...prev, newPages];
      if (updated.length > 50) return updated.slice(updated.length - 50);
      return updated;
    });
  };

  const undo = () => {
    if (history.length <= 1) return;
    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const previousState = newHistory[newHistory.length - 1];
    setHistory(newHistory);
    setPages(previousState);
    showSuccess("Desfeito");
  };

  const focusPage = (pageId: string) => {
    setActivePageId(pageId);
    setScale(1); // Zoom 100%
    setTimeout(() => {
      pageRefs.current[pageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history]);

  const saveM = useMutation({
    mutationFn: async () => {
      // If saving a mask, we need to convert pages back to layouts
      const config = mode === "mask" 
        ? { 
            layouts: pages.reduce((acc, p) => ({ ...acc, [p.templateId]: p.layers }), {}) 
          }
        : { pages };

      const payload: any = {
        name,
        tenant_id: activeTenantId!,
        config,
        updated_at: new Date().toISOString(),
      };

      if (mode === "kit") {
        payload.entity_id = entityId;
      }

      const table = mode === "mask" ? "media_kit_masks" : "media_kits";

      if (id && id !== "new") {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from(table)
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        nav(`/app/media-kit/editor/${data.id}?mode=${mode}`, { replace: true });
      }
    },
    onSuccess: () => {
      showSuccess(mode === "mask" ? "Máscara salva." : "Mídia Kit salvo.");
      qc.invalidateQueries({ queryKey: [mode === "mask" ? "media_kit_masks" : "media_kits"] });
    },
    onError: (err: any) => showError(err.message),
  });

  const addLayer = (type: Layer["type"]) => {
    if (!activePageId) return;
    const newLayer: Layer = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: type === "text" ? "Novo Texto" : type === "shape" ? "" : "https://via.placeholder.com/200",
      x: 50,
      y: 50,
      zIndex: 10,
      fontSize: type === "text" ? 48 : undefined,
      color: type === "text" ? "#000000" : type === "shape" ? "#3b82f6" : undefined,
      width: type === "image" || type === "shape" ? 200 : undefined,
      height: type === "image" || type === "shape" ? 200 : undefined,
    };
    
    const updatedPages = pages.map(p => p.id === activePageId ? { ...p, layers: [...p.layers, newLayer] } : p);
    setPages(updatedPages);
    pushToHistory(updatedPages);
    setSelectedLayerId({ pageId: activePageId, layerId: newLayer.id });
  };

  const addImageLayer = (url: string) => {
    if (!activePageId) return;
    const newLayer: Layer = {
      id: Math.random().toString(36).substr(2, 9),
      type: "image",
      content: url,
      x: 50,
      y: 50,
      zIndex: 10,
      width: 400,
      height: 400,
    };
    
    const updatedPages = pages.map(p => p.id === activePageId ? { ...p, layers: [...p.layers, newLayer] } : p);
    setPages(updatedPages);
    pushToHistory(updatedPages);
    setSelectedLayerId({ pageId: activePageId, layerId: newLayer.id });
  };

  const updateLayer = (pageId: string, layerId: string, delta: Partial<Layer>, pushHistory = false) => {
    const updatedPages = pages.map(p => p.id === pageId ? { 
      ...p, 
      layers: p.layers.map(l => l.id === layerId ? { ...l, ...delta } : l) 
    } : p);
    setPages(updatedPages);
    if (pushHistory) pushToHistory(updatedPages);
  };

  const removeLayer = (pageId: string, layerId: string) => {
    const updatedPages = pages.map(p => p.id === pageId ? { ...p, layers: p.layers.filter(l => l.id !== layerId) } : p);
    setPages(updatedPages);
    pushToHistory(updatedPages);
    if (selectedLayerId?.layerId === layerId) setSelectedLayerId(null);
  };

  const reorderLayer = (layerId: string, direction: "up" | "down") => {
    if (!activePageId) return;
    const page = pages.find(p => p.id === activePageId);
    if (!page) return;

    const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex(l => l.id === layerId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index + 1 : index - 1;
    if (newIndex < 0 || newIndex >= sorted.length) return;

    const layerToSwap = sorted[newIndex];
    const currentLayer = sorted[index];

    // Swap z-indices
    const updatedPages = pages.map(p => p.id === activePageId ? {
      ...p,
      layers: p.layers.map(l => {
        if (l.id === layerId) return { ...l, zIndex: layerToSwap.zIndex };
        if (l.id === layerToSwap.id) return { ...l, zIndex: currentLayer.zIndex };
        return l;
      })
    } : p);

    setPages(updatedPages);
    pushToHistory(updatedPages);
  };

  const applyMask = (maskId: string) => {
    const mask = masksQ.data?.find(m => m.id === maskId);
    if (!mask) return;

    setPages(pages.map(p => {
      const maskLayers = (mask.config as any)?.layouts?.[p.templateId] || [];
      return {
        ...p,
        layers: maskLayers.length > 0 ? maskLayers : p.layers
      };
    }));
    showSuccess(`Máscara "${mask.name}" aplicada.`);
  };
  
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setScale(prev => Math.min(Math.max(0.1, prev + delta), 3));
    }
  };

  const handleExportAll = async () => {
    try {
      showSuccess("Iniciando exportação de todas as páginas...");
      for (const page of pages) {
        const canvas = canvasRefs.current[page.id];
        if (canvas) {
          const dataUrl = await canvas.exportImage();
          const link = document.createElement("a");
          const template = templatesQ.data?.find(t => t.id === page.templateId);
          link.download = `${name}-${template?.name || page.id}.png`;
          link.href = dataUrl;
          link.click();
          // Small delay between downloads
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (err) {
      showError("Erro ao exportar páginas.");
    }
  };

  const selectedPage = pages.find(p => p.id === selectedLayerId?.pageId);
  const selectedLayer = selectedPage?.layers.find(l => l.id === selectedLayerId?.layerId);

  if (editorState === "setup") {
    return (
      <RequireAuth>
        <RequireRouteAccess routeKey="app.media_kit">
          <AppShell>
            <div className="max-w-4xl mx-auto space-y-8 py-8">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => nav("/app/media-kit")}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {mode === "mask" ? "Configurar Nova Máscara" : "Configurar Novo Mídia Kit"}
                  </h1>
                  <p className="text-slate-500 text-sm">
                    {mode === "mask" ? "Selecione o nome e os templates para a máscara" : "Selecione a entidade e os formatos das artes"}
                  </p>
                </div>
              </div>

              <Card className="p-6 space-y-6 rounded-2xl border-slate-200">
                <div className="space-y-4">
                  <Label className="text-base font-semibold">1. Nome do Projeto</Label>
                  <Input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Ex: Lançamento Residencial X"
                    className="rounded-xl h-12"
                  />
                </div>

                {mode === "kit" && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">2. Tipo de Arte</Label>
                    <div className="flex gap-4">
                      <Button 
                        variant={creationMode === "related" ? "secondary" : "ghost"}
                        onClick={() => setCreationMode("related")}
                        className={`flex-1 h-16 rounded-xl border-2 ${creationMode === "related" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100"}`}
                      >
                        Relacionado a Entidade
                      </Button>
                      <Button 
                        variant={creationMode === "free" ? "secondary" : "ghost"}
                        onClick={() => {
                          setCreationMode("free");
                          setEntityId(null);
                          setEntityData(null);
                        }}
                        className={`flex-1 h-16 rounded-xl border-2 ${creationMode === "free" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100"}`}
                      >
                        Arte Livre
                      </Button>
                    </div>
                  </div>
                )}

                {mode === "kit" && creationMode === "related" && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">3. Vincular Entidade</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        placeholder="Buscar por nome..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-12 rounded-xl"
                      />
                    </div>
                    <div className="grid gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {entitiesQ.data?.map(e => (
                        <Button 
                          key={e.id} 
                          variant={entityId === e.id ? "secondary" : "ghost"} 
                          className={`justify-start h-auto p-3 text-left rounded-xl transition-all ${entityId === e.id ? "ring-2 ring-blue-500 bg-blue-50" : ""}`}
                          onClick={() => {
                            setEntityId(e.id);
                            setEntityData({ ...e, ...e.metadata });
                          }}
                        >
                          <div className="flex-1">
                            <div className="font-semibold">{e.display_name}</div>
                            <div className="text-xs text-slate-500">{e.subtype}</div>
                          </div>
                          {entityId === e.id && <Check className="h-4 w-4 text-blue-600" />}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {mode === "kit" && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">{creationMode === "related" ? "4" : "3"}. Selecionar Máscara (Opcional)</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div 
                        onClick={() => setSelectedMaskId(null)}
                        className={`p-4 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center gap-2 text-center
                          ${selectedMaskId === null 
                            ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" 
                            : "border-slate-100 hover:border-slate-300 bg-white"}`}
                      >
                        <Palette className="h-4 w-4 text-slate-400" />
                        <p className="font-semibold text-sm leading-tight text-slate-400 italic">Sem Máscara</p>
                      </div>
                      {masksQ.data?.map(m => (
                        <div 
                          key={m.id}
                          onClick={() => setSelectedMaskId(m.id)}
                          className={`p-4 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center gap-2 text-center
                            ${selectedMaskId === m.id 
                              ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" 
                              : "border-slate-100 hover:border-slate-300 bg-white"}`}
                        >
                          <Layout className="h-4 w-4 text-purple-500" />
                          <p className="font-semibold text-sm leading-tight">{m.name}</p>
                          {selectedMaskId === m.id && <Check className="h-3 w-3" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <Label className="text-base font-semibold">
                    {mode === "mask" ? "2" : (creationMode === "related" ? "5" : "4")}. Selecione os Templates (Formatos)
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {templatesQ.data?.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => {
                          if (selectedTemplateIds.includes(t.id)) {
                            setSelectedTemplateIds(selectedTemplateIds.filter(id => id !== t.id));
                          } else {
                            setSelectedTemplateIds([...selectedTemplateIds, t.id]);
                          }
                        }}
                        className={`p-4 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center gap-2 text-center
                          ${selectedTemplateIds.includes(t.id) 
                            ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" 
                            : "border-slate-100 hover:border-slate-300 bg-white"}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          {t.width > t.height ? <Monitor className="h-4 w-4 text-slate-600" /> : <Smartphone className="h-4 w-4 text-slate-600" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{t.name}</p>
                          <p className="text-[10px] opacity-70">{t.width}x{t.height}</p>
                        </div>
                        {selectedTemplateIds.includes(t.id) && <Check className="h-3 w-3" />}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <Button 
                    className="w-full h-14 rounded-2xl text-lg font-bold bg-slate-900 hover:bg-slate-800"
                    disabled={selectedTemplateIds.length === 0}
                    onClick={startEditing}
                  >
                    {mode === "mask" ? "Criar Máscara e Abrir Editor" : "Criar Mídia Kit e Abrir Editor"}
                  </Button>
                </div>
              </Card>
            </div>
          </AppShell>
        </RequireRouteAccess>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.media_kit">
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden relative">
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6 z-20">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => nav("/app/media-kit")}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="flex flex-col">
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="h-8 py-0 font-bold border-none focus-visible:ring-0 text-slate-900 p-0"
                />
                <span className="text-[10px] text-slate-400 font-medium">
                  {mode === "mask" ? "Editor de Máscara" : (entityData?.display_name || "Nenhuma entidade")} • {pages.length} página(s)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportAll} disabled={pages.length === 0} className="rounded-xl">
                <Download className="mr-2 h-4 w-4" />
                Exportar Tudo
              </Button>
              <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending} className="rounded-xl">
                <Save className="mr-2 h-4 w-4" />
                {saveM.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden relative">
            {/* Left Toolbar - Fixed */}
            <aside className="w-16 border-r bg-white flex flex-col items-center py-4 gap-4 z-10">
              <Button variant="ghost" size="icon" onClick={() => addLayer("text")} title="Adicionar Texto" className="rounded-xl">
                <Type className="h-6 w-6 text-slate-600" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsGalleryOpen(true)} title="Adicionar Imagem" className="rounded-xl">
                <ImageIcon className="h-6 w-6 text-slate-600" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => addLayer("shape")} title="Adicionar Forma" className="rounded-xl">
                <Square className="h-6 w-6 text-slate-600" />
              </Button>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="Trocar Máscara" className="rounded-xl">
                    <Layout className="h-6 w-6 text-purple-600" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Trocar Máscara</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-3 py-4">
                    {masksQ.data?.map(m => (
                      <Button
                        key={m.id}
                        variant="outline"
                        className="h-20 flex flex-col gap-2 rounded-xl border-2 hover:border-blue-500"
                        onClick={() => applyMask(m.id)}
                      >
                        <Layout className="h-4 w-4 text-purple-500" />
                        <span className="text-xs font-bold">{m.name}</span>
                      </Button>
                    ))}
                    {masksQ.data?.length === 0 && (
                      <div className="col-span-2 py-8 text-center text-slate-400">
                        Nenhuma outra máscara disponível.
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <div className="mt-auto pt-4 border-t w-full flex flex-col items-center gap-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Páginas</p>
                {pages.map((p, idx) => (
                   <div 
                    key={p.id}
                    onClick={() => focusPage(p.id)}
                    className={`w-10 h-10 rounded-lg border-2 cursor-pointer flex items-center justify-center text-xs font-bold transition-all
                      ${activePageId === p.id ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400 hover:border-slate-300"}`}
                   >
                     {idx + 1}
                   </div>
                ))}
              </div>
            </aside>

            {/* Main Editor - Scrollable */}
            <main 
              onWheel={handleWheel}
              className="flex-1 overflow-auto bg-slate-100 flex flex-col items-center gap-16 py-20 px-4 custom-scrollbar overscroll-x-none"
              style={{ overscrollBehaviorX: "none" }}
            >
              <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border shadow-sm z-30 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setScale(prev => Math.max(0.1, prev - 0.1))} className="h-8 w-8 rounded-full">
                  -
                </Button>
                <span className="text-xs font-bold text-slate-600 min-w-[3rem] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button variant="ghost" size="icon" onClick={() => setScale(prev => Math.min(3, prev + 0.1))} className="h-8 w-8 rounded-full">
                  +
                </Button>
              </div>

              {pages.map((page, idx) => {
                const template = templatesQ.data?.find(t => t.id === page.templateId);
                return (
                  <div key={page.id} ref={(el) => { pageRefs.current[page.id] = el; }} className="flex flex-col items-center gap-4 group">
                    <div className="flex items-center justify-between w-full px-2">
                       <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                         Página {idx + 1} • {template?.name || "Original"} ({template?.width}x{template?.height})
                       </span>
                       <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setActivePageId(page.id)}
                        className={`h-6 w-6 rounded-full ${activePageId === page.id ? "text-blue-500 bg-blue-50" : "text-slate-300"}`}
                       >
                         <Check className="h-3 w-3" />
                       </Button>
                    </div>
                    <div className={`relative p-2 rounded-xl transition-all ${activePageId === page.id ? "ring-2 ring-blue-400 ring-offset-8" : "hover:ring-2 hover:ring-slate-300 hover:ring-offset-8"}`}>
                      <MediaKitCanvas
                        ref={(el) => { if (el) canvasRefs.current[page.id] = el; }}
                        layers={page.layers}
                        width={template?.width || 1080}
                        height={template?.height || 1080}
                        selectedLayerId={selectedLayerId?.pageId === page.id ? selectedLayerId.layerId : null}
                        onSelectLayer={(layerId) => {
                          setActivePageId(page.id);
                          setSelectedLayerId(layerId ? { pageId: page.id, layerId } : null);
                        }}
                        onUpdateLayer={(layerId, delta) => updateLayer(page.id, layerId, delta)}
                        scale={scale}
                        entityData={entityData}
                      />
                    </div>
                  </div>
                );
              })}
              {pages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-slate-400 gap-4 mt-20">
                  <Layers className="h-16 w-16 opacity-20" />
                  <p>Nenhuma página configurada.</p>
                </div>
              )}
            </main>

            {/* Right Properties Panel - Fixed */}
            <aside className="w-80 shrink-0 border-l bg-white overflow-y-auto z-10">
              <div className="p-6 space-y-8">
                {selectedLayer ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 capitalize leading-none">{selectedLayer.type} Props</h3>
                      <Button variant="destructive" size="icon" onClick={() => removeLayer(selectedLayerId!.pageId, selectedLayer.id)} className="h-8 w-8 rounded-full">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {selectedLayer.type === "text" && (
                        <>
                          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="space-y-0.5">
                              <Label className="text-xs font-bold text-slate-700">Conteúdo Variável</Label>
                              <p className="text-[10px] text-slate-500">Vincular a um campo da entidade</p>
                            </div>
                            <Switch 
                              checked={!!selectedLayer.isVariable}
                              onCheckedChange={(val) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { isVariable: val }, true)}
                            />
                          </div>

                          {selectedLayer.isVariable ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Campo da Entidade</Label>
                              <Select 
                                value={selectedLayer.variableField || ""} 
                                onValueChange={(val) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { variableField: val }, true)}
                              >
                                <SelectTrigger className="rounded-xl h-10">
                                  <SelectValue placeholder="Selecione um campo..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {Object.entries(entityData?.metadata?.media_kit_config || {})
                                    .filter(([_, enabled]) => enabled)
                                    .map(([field]) => (
                                      <SelectItem key={field} value={field} className="capitalize">{field.replace("_", " ")}</SelectItem>
                                    ))
                                  }
                                  {/* Also offer core fields regardless of config for now as standard */}
                                  <SelectItem value="display_name">Nome de Exibição</SelectItem>
                                  <SelectItem value="entity_type">Tipo</SelectItem>
                                  <SelectItem value="status">Status</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Label>Conteúdo</Label>
                              <Input 
                                value={selectedLayer.content} 
                                onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { content: e.target.value }, true)} 
                                className="rounded-xl"
                              />
                              <p className="text-[10px] text-slate-400">Use {"{{campo}}"} para info da entidade</p>
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500">Tamanho da Fonte: {selectedLayer.fontSize}px</Label>
                            <Slider 
                              value={[selectedLayer.fontSize || 16]} 
                              min={12} max={300} step={1}
                              onValueChange={([v]) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { fontSize: v }, true)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500">Cor</Label>
                            <div className="flex gap-2">
                              <Input 
                                type="color" 
                                value={selectedLayer.color} 
                                onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                className="w-12 h-10 p-1 border-none cursor-pointer"
                              />
                              <Input 
                                value={selectedLayer.color} 
                                onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                className="flex-1 rounded-xl text-xs uppercase"
                                placeholder="#000000"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {(selectedLayer.type === "image" || selectedLayer.type === "shape") && (
                        <>
                          {selectedLayer.type === "image" && (
                             <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                  <div className="space-y-0.5">
                                    <Label className="text-xs font-bold text-slate-700">Imagem Variável</Label>
                                    <p className="text-[10px] text-slate-500">Vincular a um campo da entidade</p>
                                  </div>
                                  <Switch 
                                    checked={!!selectedLayer.isVariable}
                                    onCheckedChange={(val) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { isVariable: val }, true)}
                                  />
                                </div>

                                {selectedLayer.isVariable ? (
                                  <div className="space-y-2">
                                    <Label className="text-xs text-slate-500">Campo da Imagem</Label>
                                    <Select 
                                      value={selectedLayer.variableField || ""} 
                                      onValueChange={(val) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { variableField: val }, true)}
                                    >
                                      <SelectTrigger className="rounded-xl h-10">
                                        <SelectValue placeholder="Selecione um campo..." />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-xl">
                                        {Object.entries(entityData?.metadata || {})
                                          .filter(([k]) => k.toLowerCase().includes("img") || k.toLowerCase().includes("foto") || k.toLowerCase().includes("url"))
                                          .map(([key]) => (
                                            <SelectItem key={key} value={key}>{key}</SelectItem>
                                          ))
                                        }
                                        <SelectItem value="display_name">Nome (como placeholder)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Label>URL da Imagem</Label>
                                    <Input 
                                      value={selectedLayer.content} 
                                      onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { content: e.target.value }, true)} 
                                      className="rounded-xl"
                                    />
                                  </div>
                                )}
                             </div>
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs text-slate-500">Largura</Label>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => {
                                    const template = templatesQ.data?.find(t => t.id === activePage?.templateId);
                                    if (template) updateLayer(selectedLayerId!.pageId, selectedLayer.id, { width: template.width }, true);
                                  }}
                                >
                                  100% W
                                </Button>
                              </div>
                              <Input 
                                type="number"
                                value={selectedLayer.width} 
                                onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { width: parseInt(e.target.value) }, true)} 
                                className="rounded-xl"
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs text-slate-500">Altura</Label>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => {
                                    const template = templatesQ.data?.find(t => t.id === activePage?.templateId);
                                    if (template) updateLayer(selectedLayerId!.pageId, selectedLayer.id, { height: template.height }, true);
                                  }}
                                >
                                  100% H
                                </Button>
                              </div>
                              <Input 
                                type="number"
                                value={selectedLayer.height} 
                                onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { height: parseInt(e.target.value) }, true)} 
                                className="rounded-xl"
                              />
                            </div>
                          </div>
                          {selectedLayer.type === "shape" && (
                             <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Cor de Fundo</Label>
                              <div className="flex gap-2">
                                <Input 
                                  type="color" 
                                  value={selectedLayer.color} 
                                  onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                  className="w-12 h-10 p-1 border-none cursor-pointer"
                                />
                                <Input 
                                  value={selectedLayer.color} 
                                  onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                  className="flex-1 rounded-xl text-xs uppercase"
                                  placeholder="#3b82f6"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Posição X</Label>
                          <Input 
                            type="number"
                            value={Math.round(selectedLayer.x)} 
                            onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { x: parseInt(e.target.value) }, true)} 
                            className="rounded-xl h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Posição Y</Label>
                          <Input 
                            type="number"
                            value={Math.round(selectedLayer.y)} 
                            onChange={(e) => updateLayer(selectedLayerId!.pageId, selectedLayer.id, { y: parseInt(e.target.value) }, true)} 
                            className="rounded-xl h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <MediaKitLayers 
                    layers={activePage?.layers || []}
                    selectedLayerId={null}
                    onSelect={(layerId) => setSelectedLayerId({ pageId: activePageId!, layerId })}
                    onRemove={(layerId) => removeLayer(activePageId!, layerId)}
                    onReorder={reorderLayer}
                  />
                )}
              </div>
            </aside>
          </div>
          
          <MediaKitGallery 
            open={isGalleryOpen}
            onOpenChange={setIsGalleryOpen}
            onSelect={addImageLayer}
          />
        </div>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

const styleText = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #cbd5e1;
  }
`;

if (typeof document !== 'undefined') {
  const style = document.createElement("style");
  style.innerHTML = styleText;
  document.head.appendChild(style);
}
