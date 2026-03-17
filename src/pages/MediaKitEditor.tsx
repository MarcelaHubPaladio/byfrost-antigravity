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
  ChevronUp,
  ChevronDown,
  Maximize2,
  Search,
  Check,
  Smartphone,
  Monitor,
  Palette,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { MediaKitCanvas, Layer } from "@/components/media-kit/MediaKitCanvas";
import { ImageUpload } from "@/components/portal/ImageUpload";
import { MediaKitGallery } from "@/components/media-kit/MediaKitGallery";
import { MediaKitLayers } from "@/components/media-kit/MediaKitLayers";
import { IconPicker } from "@/components/media-kit/IconPicker";
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

const STANDARD_LABELS: Record<string, string> = {
  display_name: "Nome de Exibição",
  entity_type: "Tipo de Entidade",
  status: "Status",
  legacy_id: "ID Legado",
  internal_code: "Código Interno",
  location_json: "Localização",
  business_type: "Tipo de Negócio",
  property_type: "Tipo de Imóvel",
  total_area: "Área Total",
  useful_area: "Área Útil",
  price_sale: "Preço de Venda",
  price_rent: "Preço de Aluguel",
  price_consult: "Preço sob Consulta",
};

export default function MediaKitEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const canvasRefs = useRef<{ [key: string]: any }>({});
  const pageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const editorRef = useRef<HTMLDivElement>(null);

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
  const [selectedLayerIds, setSelectedLayerIds] = useState<{ pageId: string; layerIds: string[] } | null>(null);
  const [clipboard, setClipboard] = useState<{ type: "layers"; data: Layer[] } | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const activePage = pages.find(p => p.id === activePageId);

  const [isEntityDialogOpen, setIsEntityDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [scale, setScale] = useState(0.5);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  
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
        setHistory([config.pages]);
      } else if (config.layouts) {
        // Mask format: convert layouts to pages for the editor
        const maskPages = Object.entries(config.layouts).map(([tid, layers], idx) => ({
          id: `page-${idx}-${Date.now()}`,
          templateId: tid,
          layers: layers as Layer[]
        }));
        setPages(maskPages);
        if (maskPages.length > 0) setActivePageId(maskPages[0].id);
        setHistory([maskPages]);
      } else if (config.layers) {
        // Migration of old data format
        const migratedPages = [{ id: "p1", templateId: "unknown", layers: config.layers }];
        setPages(migratedPages);
        setActivePageId("p1");
        setHistory([migratedPages]);
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
      let query = supabase
        .from("core_entities")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .limit(10);

      if (searchTerm) {
        query = query.or(`display_name.ilike.%${searchTerm}%,legacy_id.ilike.%${searchTerm}%,internal_code.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  
  const entityPhotosQ = useQuery({
    queryKey: ["entity_photos", activeTenantId, entityId],
    enabled: !!activeTenantId && !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entity_photos")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_id", entityId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      const roomCounts: Record<string, number> = {};
      data?.forEach(p => {
        const t = p.room_type || "Geral";
        roomCounts[t] = (roomCounts[t] || 0) + 1;
      });

      return { photos: data || [], roomCounts };
    },
  });

  const roomTypesQ = useQuery({
    queryKey: ["room_types", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_property_room_types")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
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
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      
      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const copyLayer = () => {
          if (!selectedLayerIds || selectedLayerIds.layerIds.length === 0) return;
          const page = pages.find(p => p.id === selectedLayerIds!.pageId);
          if (!page) return;
          const layersToCopy = page.layers.filter(l => selectedLayerIds.layerIds.includes(l.id));
          if (layersToCopy.length === 0) return;
          setClipboard({ type: "layers", data: layersToCopy });
        };
        copyLayer(); // Call the function
        // Don't preventDefault so native copy might still work elsewhere if needed, 
        // but for layers we want our logic.
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard && activePageId) {
          e.preventDefault();
          
          const page = pages.find(p => p.id === activePageId);
          if (!page) return;
          const maxZ = page.layers.length ? Math.max(...page.layers.map(l => l.zIndex)) : 0;

          const newLayerData = clipboard.data.map((l, i) => ({
            ...l,
            id: crypto.randomUUID(),
            x: l.x + 20,
            y: l.y + 20,
            zIndex: maxZ + (i + 1) * 10,
          }));

          setPages(prev => {
            const updatedPages = prev.map(p => p.id === activePageId ? { ...p, layers: [...p.layers, ...newLayerData] } : p);
            pushToHistory(updatedPages);
            return updatedPages;
          });
          setSelectedLayerIds({ 
            pageId: activePageId, 
            layerIds: newLayerData.map(l => l.id) 
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, selectedLayerIds, pages, activePageId, clipboard]);

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

    setPages(prev => {
      const page = prev.find(p => p.id === activePageId);
      const maxZ = page?.layers.length ? Math.max(...page.layers.map(l => l.zIndex)) : 0;

      const newLayer: Layer = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        content: type === "text" ? "Novo Texto" : type === "shape" ? "" : "https://via.placeholder.com/200",
        x: 50,
        y: 50,
        zIndex: maxZ + 10,
        fontSize: type === "text" ? 48 : undefined,
        color: type === "text" ? "#000000" : type === "shape" ? "#3b82f6" : undefined,
        width: type === "image" || type === "shape" ? 200 : undefined,
        height: type === "image" || type === "shape" ? 200 : undefined,
      };

      const updatedPages = prev.map(p => p.id === activePageId ? { ...p, layers: [...p.layers, newLayer] } : p);
      pushToHistory(updatedPages);
      setSelectedLayerIds({ pageId: activePageId, layerIds: [newLayer.id] });
      return updatedPages;
    });
  };

  const addIconLayer = (iconName: string) => {
    if (!activePageId) return;

    setPages(prev => {
      const page = prev.find(p => p.id === activePageId);
      const maxZ = page?.layers.length ? Math.max(...page.layers.map(l => l.zIndex)) : 0;

      const newLayer: Layer = {
        id: Math.random().toString(36).substr(2, 9),
        type: "icon",
        content: iconName,
        x: 100,
        y: 100,
        zIndex: maxZ + 10,
        width: 100,
        height: 100,
        color: "#3b82f6",
      };

      const updatedPages = prev.map(p => p.id === activePageId ? { ...p, layers: [...p.layers, newLayer] } : p);
      pushToHistory(updatedPages);
      setSelectedLayerIds({ pageId: activePageId, layerIds: [newLayer.id] });
      return updatedPages;
    });
  };

  const addImageLayer = (url: string) => {
    if (!activePageId) return;
    
    setPages(prev => {
      const page = prev.find(p => p.id === activePageId);
      const maxZ = page?.layers.length ? Math.max(...page.layers.map(l => l.zIndex)) : 0;

      const newLayer: Layer = {
        id: crypto.randomUUID(),
        type: "image",
        content: url,
        x: 50,
        y: 50,
        zIndex: maxZ + 10,
        width: 400,
        height: 400,
      };

      const updatedPages = prev.map(p => p.id === activePageId ? { ...p, layers: [...p.layers, newLayer] } : p);
      pushToHistory(updatedPages);
      setSelectedLayerIds({ pageId: activePageId, layerIds: [newLayer.id] });
      return updatedPages;
    });
  };


  const updateLayer = (pageId: string, layerId: string, delta: Partial<Layer>, pushHistory?: boolean) => {
    setPages(prev => {
      const updatedPages = prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          layers: p.layers.map(l => l.id === layerId ? { ...l, ...delta } : l)
        };
      });
      if (pushHistory) pushToHistory(updatedPages);
      return updatedPages;
    });
  };

  const removeLayer = (pageId: string, layerId: string) => {
    setPages(prev => {
      const updatedPages = prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          layers: p.layers.filter(l => l.id !== layerId)
        };
      });
      pushToHistory(updatedPages);
      return updatedPages;
    });
    setSelectedLayerIds(null);
  };

  const reorderLayer = (layerId: string, direction: "up" | "down") => {
    if (!activePageId) return;
    
    setPages(prev => {
      const page = prev.find(p => p.id === activePageId);
      if (!page) return prev;

      // 1. Get layers sorted by current zIndex
      const currentLayers = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
      const index = currentLayers.findIndex(l => l.id === layerId);
      if (index === -1) return prev;

      // 2. Calculate target position
      const newIndex = direction === "up" ? index + 1 : index - 1;
      if (newIndex < 0 || newIndex >= currentLayers.length) return prev;

      // 3. Reorder the array
      const reorderedArray = [...currentLayers];
      const [item] = reorderedArray.splice(index, 1);
      reorderedArray.splice(newIndex, 0, item);

      // 4. Normalize Z-indices (multiply by 10 to ensure unique values and room for growth)
      const updatedLayers = page.layers.map(l => {
        const idxInNewArray = reorderedArray.findIndex(r => r.id === l.id);
        return { ...l, zIndex: (idxInNewArray + 1) * 10 };
      });

      const updatedPages = prev.map(p => p.id === activePageId ? {
        ...p,
        layers: updatedLayers
      } : p);

      pushToHistory(updatedPages);
      return updatedPages;
    });
  };

  const handleDragReorder = (pageId: string, updatedLayers: Layer[]) => {
    setPages(prev => {
      const updatedPages = prev.map(p => p.id === pageId ? { ...p, layers: updatedLayers } : p);
      pushToHistory(updatedPages);
      return updatedPages;
    });
  };

  const applyMask = (maskId: string) => {
    const mask = masksQ.data?.find(m => m.id === maskId);
    if (!mask) return;

    const updatedPages = pages.map(p => {
      const maskLayers = (mask.config as any)?.layouts?.[p.templateId] || [];
      return {
        ...p,
        layers: maskLayers.length > 0 ? maskLayers : p.layers
      };
    });
    setPages(updatedPages);
    pushToHistory(updatedPages);
    showSuccess(`Máscara "${mask.name}" aplicada.`);
  };
  
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setScale(prev => Math.min(Math.max(0.1, prev + delta), 3));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [editorRef]);

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

  const selectedPage = pages.find(p => p.id === selectedLayerIds?.pageId);
  const selectedLayers = selectedPage?.layers.filter(l => selectedLayerIds?.layerIds.includes(l.id)) || [];
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;

  const alignLayers = (type: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (selectedLayers.length < 2) return;
    const pageId = selectedLayerIds!.pageId;
    
    let targetValue: number;
    const boxes = selectedLayers.map(l => ({
      id: l.id,
      x: l.x,
      y: l.y,
      w: l.width || 0,
      h: l.height || 0
    }));

    if (type === "left") targetValue = Math.min(...boxes.map(b => b.x));
    else if (type === "right") targetValue = Math.max(...boxes.map(b => b.x + b.w));
    else if (type === "top") targetValue = Math.min(...boxes.map(b => b.y));
    else if (type === "bottom") targetValue = Math.max(...boxes.map(b => b.y + b.h));
    else if (type === "center") {
      const minX = Math.min(...boxes.map(b => b.x));
      const maxX = Math.max(...boxes.map(b => b.x + b.w));
      targetValue = minX + (maxX - minX) / 2;
    } else { // middle
      const minY = Math.min(...boxes.map(b => b.y));
      const maxY = Math.max(...boxes.map(b => b.y + b.h));
      targetValue = minY + (maxY - minY) / 2;
    }

    setPages(prev => {
      const updatedPages = prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          layers: p.layers.map(l => {
            if (!selectedLayerIds!.layerIds.includes(l.id)) return l;
            const b = boxes.find(box => box.id === l.id)!;
            if (type === "left") return { ...l, x: targetValue };
            if (type === "right") return { ...l, x: targetValue - b.w };
            if (type === "top") return { ...l, y: targetValue };
            if (type === "bottom") return { ...l, y: targetValue - b.h };
            if (type === "center") return { ...l, x: targetValue - b.w / 2 };
            if (type === "middle") return { ...l, y: targetValue - b.h / 2 };
            return l;
          })
        };
      });
      pushToHistory(updatedPages);
      return updatedPages;
    });
  };

  const handleZoomToFit = () => {
    const el = editorRef.current;
    if (!el || !activePageId) return;

    const activePage = pages.find(p => p.id === activePageId);
    if (!activePage) return;

    const template = templatesQ.data?.find(t => t.id === activePage.templateId);
    if (!template) return;

    const padding = 64; 
    const availableWidth = el.clientWidth - padding;
    const availableHeight = el.clientHeight - padding;

    const scaleX = availableWidth / template.width;
    const scaleY = availableHeight / template.height;

    const newScale = Math.min(scaleX, scaleY, 3);
    setScale(Math.max(0.1, newScale));
    
    focusPage(activePageId);
  };

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
                        placeholder="Buscar por nome, código legado ou interno..." 
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
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-medium">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{e.subtype}</span>
                              {e.internal_code && (
                                <span className="text-blue-600">#{e.internal_code}</span>
                              )}
                              {e.legacy_id && (
                                <span className="text-slate-400">
                                  {e.internal_code ? "• ID: " : "ID: "}{e.legacy_id}
                                </span>
                              )}
                            </div>
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
              <Button variant="ghost" size="icon" onClick={() => setIsIconPickerOpen(true)} title="Biblioteca de Ícones" className="rounded-xl">
                <Palette className="h-6 w-6 text-indigo-600" />
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
              ref={editorRef}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedLayerIds(null);
                }
              }}
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
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleZoomToFit} 
                  className="h-8 w-8 rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50"
                  title="Ajustar à Tela"
                >
                  <Maximize2 className="h-4 w-4" />
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
                        selectedLayerIds={selectedLayerIds?.pageId === page.id ? selectedLayerIds.layerIds : null}
                        onSelectLayer={(layerId, isShift) => {
                          setActivePageId(page.id);
                          if (isShift) {
                            const currentIds = selectedLayerIds?.pageId === page.id ? selectedLayerIds.layerIds : [];
                            if (currentIds.includes(layerId)) {
                              setSelectedLayerIds({ pageId: page.id, layerIds: currentIds.filter(id => id !== layerId) });
                            } else {
                              setSelectedLayerIds({ pageId: page.id, layerIds: [...currentIds, layerId] });
                            }
                          } else {
                            setSelectedLayerIds(layerId ? { pageId: page.id, layerIds: [layerId] } : null);
                          }
                        }}
                        onSelectLayers={(ids) => {
                          setActivePageId(page.id);
                          setSelectedLayerIds(ids.length > 0 ? { pageId: page.id, layerIds: ids } : null);
                        }}
                        onUpdateLayer={(layerId, delta) => updateLayer(page.id, layerId, delta)}
                        scale={scale}
                        entityData={entityData}
                        entityPhotos={entityPhotosQ.data?.photos || []}
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
                {selectedLayers.length > 1 ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">Propriedades do Grupo</h3>
                      <span className="text-xs text-slate-400">{selectedLayers.length} itens</span>
                    </div>
                    
                    <div className="space-y-4">
                      <Label className="text-xs text-slate-500">Alinhamento</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button variant="outline" size="sm" onClick={() => alignLayers("left")} className="h-10 rounded-xl">
                          <AlignLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => alignLayers("center")} className="h-10 rounded-xl">
                          <AlignCenter className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => alignLayers("right")} className="h-10 rounded-xl">
                          <AlignRight className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => alignLayers("top")} className="h-10 rounded-xl">
                          <AlignStartVertical className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => alignLayers("middle")} className="h-10 rounded-xl">
                          <AlignCenterVertical className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => alignLayers("bottom")} className="h-10 rounded-xl">
                          <AlignEndVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : selectedLayer ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setSelectedLayerIds(null)}
                          className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <h3 className="font-bold text-slate-900 capitalize leading-none">{selectedLayer.type} Props</h3>
                      </div>
                      <Button variant="destructive" size="icon" onClick={() => removeLayer(selectedLayerIds!.pageId, selectedLayer.id)} className="h-8 w-8 rounded-full">
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
                              onCheckedChange={(val) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { isVariable: val }, true)}
                            />
                          </div>

                          {selectedLayer.isVariable ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Campo da Entidade</Label>
                              <Select 
                                value={selectedLayer.variableField || ""} 
                                onValueChange={(val) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { variableField: val }, true)}
                              >
                                <SelectTrigger className="rounded-xl h-10">
                                  <SelectValue placeholder="Selecione um campo..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {/* core fields with standardized labels */}
                                  {Object.keys(STANDARD_LABELS).map(key => (
                                    <SelectItem key={key} value={key}>{STANDARD_LABELS[key]}</SelectItem>
                                  ))}
                                  
                                  {/* dynamic metadata fields from config */}
                                  {Object.entries(entityData?.metadata?.media_kit_config || {})
                                    .filter(([field, enabled]) => enabled && !STANDARD_LABELS[field])
                                    .map(([field]) => (
                                      <SelectItem key={field} value={field} className="capitalize">{field.replace("_", " ")}</SelectItem>
                                    ))
                                  }

                                  {/* room counts if applicable */}
                                  {Object.entries(entityPhotosQ.data?.roomCounts || {}).map(([room, count]) => (
                                    <SelectItem key={`room_${room}`} value={`room_${room}`}>{room}: {count}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Label>Conteúdo</Label>
                              <Input 
                                value={selectedLayer.content} 
                                onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { content: e.target.value }, true)} 
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
                              onValueChange={([v]) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { fontSize: v }, true)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500">Cor</Label>
                            <div className="flex gap-2">
                              <Input 
                                type="color" 
                                value={selectedLayer.color} 
                                onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                className="w-12 h-10 p-1 border-none cursor-pointer"
                              />
                              <Input 
                                value={selectedLayer.color} 
                                onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                className="flex-1 rounded-xl text-xs uppercase"
                                placeholder="#000000"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {(selectedLayer.type === "image" || selectedLayer.type === "shape" || selectedLayer.type === "icon") && (
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
                                    onCheckedChange={(val) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { isVariable: val }, true)}
                                  />
                                </div>

                                {selectedLayer.isVariable ? (
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label className="text-xs text-slate-500">Mapear Cômodo (Prioritário)</Label>
                                      <Select 
                                        value={selectedLayer.variableRoomType || "none"} 
                                        onValueChange={(val) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { variableRoomType: val === "none" ? "" : val }, true)}
                                      >
                                        <SelectTrigger className="rounded-xl h-10">
                                          <SelectValue placeholder="Selecione um cômodo..." />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                          <SelectItem value="none">Nenhum (Usar Campo abaixo)</SelectItem>
                                          {roomTypesQ.data?.map((room: any) => (
                                            <SelectItem key={room.id} value={room.name}>{room.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <p className="text-[10px] text-slate-400 italic">Se selecionado, tenta buscar a imagem deste cômodo primeiro.</p>
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="text-xs text-slate-500">Campo da Imagem (Fallback)</Label>
                                      <Select 
                                        value={selectedLayer.variableField || ""} 
                                        onValueChange={(val) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { variableField: val }, true)}
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
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trocar Imagem</Label>
                                      <ImageUpload 
                                        value={selectedLayer.content} 
                                        onChange={(url) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { content: url }, true)} 
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">URL Direta</Label>
                                      <Input 
                                        value={selectedLayer.content} 
                                        onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { content: e.target.value }, true)} 
                                        className="rounded-xl h-8 text-xs"
                                      />
                                    </div>
                                  </div>
                                )}
                             </div>
                          )}
                          <div className="space-y-2">
                             <Label className="text-xs text-slate-500">Canto Arredondado: {selectedLayer.borderRadius || 0}px</Label>
                             <Slider 
                               value={[selectedLayer.borderRadius || 0]} 
                               min={0} max={Math.min(selectedLayer.width || 1000, selectedLayer.height || 1000) / 2} step={1}
                               onValueChange={([v]) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { borderRadius: v }, true)}
                             />
                          </div>
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
                                    if (template) updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { width: template.width }, true);
                                  }}
                                >
                                  100% W
                                </Button>
                              </div>
                              <Input 
                                type="number"
                                value={selectedLayer.width} 
                                onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { width: parseInt(e.target.value) }, true)} 
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
                                    if (template) updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { height: template.height }, true);
                                  }}
                                >
                                  100% H
                                </Button>
                              </div>
                              <Input 
                                type="number"
                                value={selectedLayer.height} 
                                onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { height: parseInt(e.target.value) }, true)} 
                                className="rounded-xl"
                              />
                            </div>
                          </div>
                          {selectedLayer.type === "icon" && (
                             <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Cor do Ícone</Label>
                              <div className="flex gap-2">
                                <Input 
                                  type="color" 
                                  value={selectedLayer.color} 
                                  onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                  className="w-12 h-10 p-1 border-none cursor-pointer"
                                />
                                <Input 
                                  value={selectedLayer.color} 
                                  onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { color: e.target.value }, true)} 
                                  className="flex-1 rounded-xl text-xs uppercase"
                                  placeholder="#3b82f6"
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-2 py-4 border-t border-slate-100">
                             <Label className="text-xs text-slate-500">Opacidade: {Math.round((selectedLayer.opacity ?? 1) * 100)}%</Label>
                             <Slider 
                               value={[(selectedLayer.opacity ?? 1) * 100]} 
                               min={0} max={100} step={1}
                               onValueChange={([v]) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { opacity: v / 100 }, true)}
                             />
                          </div>
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Posição X</Label>
                          <Input 
                            type="number"
                            value={Math.round(selectedLayer.x)} 
                            onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { x: parseInt(e.target.value) }, true)} 
                            className="rounded-xl h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Posição Y</Label>
                          <Input 
                            type="number"
                            value={Math.round(selectedLayer.y)} 
                            onChange={(e) => updateLayer(selectedLayerIds!.pageId, selectedLayer.id, { y: parseInt(e.target.value) }, true)} 
                            className="rounded-xl h-8 text-xs"
                          />
                        </div>
                      </div>
                       <div className="space-y-2 pt-2 border-t border-slate-100">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordem das Camadas</Label>
                          <div className="grid grid-cols-2 gap-2">
                             <Button 
                               variant="outline" 
                               size="sm" 
                               className="h-9 gap-2 rounded-xl text-xs font-bold"
                               onClick={() => reorderLayer(selectedLayer.id, "up")}
                             >
                               <ChevronUp className="h-4 w-4" /> Trazer
                             </Button>
                             <Button 
                               variant="outline" 
                               size="sm" 
                               className="h-9 gap-2 rounded-xl text-xs font-bold"
                               onClick={() => reorderLayer(selectedLayer.id, "down")}
                             >
                               <ChevronDown className="h-4 w-4" /> Enviar
                             </Button>
                          </div>
                       </div>
                    </div>
                  </>
                ) : activePage ? (
                  <MediaKitLayers 
                    layers={activePage.layers} 
                    selectedLayerIds={selectedLayerIds && selectedLayerIds.pageId === activePage.id ? selectedLayerIds.layerIds : null}
                    onSelect={(layerId, isShift) => {
                      if (isShift) {
                        const currentIds = selectedLayerIds?.pageId === activePage.id ? selectedLayerIds.layerIds : [];
                        if (currentIds.includes(layerId)) {
                          setSelectedLayerIds({ pageId: activePage.id, layerIds: currentIds.filter(id => id !== layerId) });
                        } else {
                          setSelectedLayerIds({ pageId: activePage.id, layerIds: [...currentIds, layerId] });
                        }
                      } else {
                        setSelectedLayerIds({ pageId: activePage.id, layerIds: [layerId] });
                      }
                    }}
                    onRemove={(layerId) => removeLayer(activePage.id, layerId)}
                    onReorder={(layerId, dir) => reorderLayer(layerId, dir)}
                    onDragReorder={(updatedLayers) => handleDragReorder(activePage.id, updatedLayers)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                    <Layers className="h-8 w-8 opacity-20" />
                    <p className="text-xs">Nenhuma página selecionada</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
          
          <MediaKitGallery 
            open={isGalleryOpen}
            onOpenChange={setIsGalleryOpen}
            onSelect={addImageLayer}
          />

          <IconPicker 
            open={isIconPickerOpen}
            onOpenChange={setIsIconPickerOpen}
            onSelect={addIconLayer}
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
