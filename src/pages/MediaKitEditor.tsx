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
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { MediaKitCanvas, Layer } from "@/components/media-kit/MediaKitCanvas";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
  const canvasRef = useRef<any>(null);

  const initialEntityId = searchParams.get("entityId");

  const [name, setName] = useState("Novo Mídia Kit");
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<any>(null);
  const [isEntityDialogOpen, setIsEntityDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editorDimensions, setEditorDimensions] = useState({ width: 1080, height: 1080 });
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");

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

  const [activeTemplate, setActiveTemplate] = useState<any>(null);

  useEffect(() => {
    if (templatesQ.data?.length && !activeTemplate && !id) {
      const first = templatesQ.data[0];
      setActiveTemplate(first);
      setEditorDimensions({ width: first.width, height: first.height });
      setOrientation(first.width > first.height ? "horizontal" : "vertical");
    }
  }, [templatesQ.data, activeTemplate, id]);

  const kitQ = useQuery({
    queryKey: ["media_kit", id],
    enabled: !!id && id !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kits")
        .select("*, entities:core_entities(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (kitQ.data) {
      setName(kitQ.data.name);
      setLayers((kitQ.data.config as any).layers || []);
      setEntityId(kitQ.data.entity_id);
      setEntityData({
        ...kitQ.data.entities,
        ...kitQ.data.entities?.metadata
      });
      
      const config = kitQ.data.config as any;
      if (config.width && config.height) {
        setEditorDimensions({ width: config.width, height: config.height });
        setOrientation(config.width > config.height ? "horizontal" : "vertical");
      }
    }
  }, [kitQ.data]);

  const entitiesQ = useQuery({
    queryKey: ["entities_search", activeTenantId, searchTerm],
    enabled: !!activeTenantId && isEntityDialogOpen,
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

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        tenant_id: activeTenantId!,
        entity_id: entityId,
        config: { 
          layers,
          width: editorDimensions.width,
          height: editorDimensions.height,
          orientation 
        },
        updated_at: new Date().toISOString(),
      };

      if (id && id !== "new") {
        const { error } = await supabase
          .from("media_kits")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("media_kits")
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        nav(`/app/media-kit/editor/${data.id}`, { replace: true });
      }
    },
    onSuccess: () => {
      showSuccess("Mídia Kit salvo.");
      qc.invalidateQueries({ queryKey: ["media_kits"] });
    },
    onError: (err: any) => showError(err.message),
  });

  const addLayer = (type: Layer["type"]) => {
    const newLayer: Layer = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: type === "text" ? "Novo Texto" : type === "shape" ? "" : "https://via.placeholder.com/200",
      x: 50,
      y: 50,
      zIndex: layers.length,
      fontSize: type === "text" ? 48 : undefined,
      color: type === "text" ? "#000000" : type === "shape" ? "#3b82f6" : undefined,
      width: type === "image" || type === "shape" ? 200 : undefined,
      height: type === "image" || type === "shape" ? 200 : undefined,
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const updateLayer = (id: string, delta: Partial<Layer>) => {
    setLayers(layers.map(l => l.id === id ? { ...l, ...delta } : l));
  };

  const removeLayer = (id: string) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  const handleExport = async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await canvasRef.current.exportImage();
      const link = document.createElement("a");
      link.download = `${name}-${orientation}.png`;
      link.href = dataUrl;
      link.click();
      showSuccess("Sua arte está sendo baixada!");
    } catch (err) {
      showError("Erro ao exportar imagem.");
    }
  };

  const handleTemplateSelect = (t: any) => {
    setActiveTemplate(t);
    // Keep current orientation or use template's natural one
    if (orientation === "horizontal") {
      const max = Math.max(t.width, t.height);
      const min = Math.min(t.width, t.height);
      setEditorDimensions({ width: max, height: min });
    } else {
      const max = Math.max(t.width, t.height);
      const min = Math.min(t.width, t.height);
      setEditorDimensions({ width: min, height: max });
    }
  };

  const toggleOrientation = (newOrientation: "vertical" | "horizontal") => {
    if (newOrientation === orientation) return;
    setOrientation(newOrientation);
    setEditorDimensions({
      width: editorDimensions.height,
      height: editorDimensions.width
    });
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.media_kit">
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
          {/* Header */}
          <header className="flex h-16 items-center justify-between border-b bg-white px-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => nav("/app/media-kit")}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="w-64 font-semibold border-none focus-visible:ring-1"
              />
              <Dialog open={isEntityDialogOpen} onOpenChange={setIsEntityDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full">
                    {entityData ? entityData.display_name : "Vincular Entidade"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Vincular Entidade</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        placeholder="Buscar imóvel..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="grid gap-2">
                      {entitiesQ.data?.map(e => (
                        <Button 
                          key={e.id} 
                          variant="ghost" 
                          className="justify-start h-auto p-3 text-left"
                          onClick={() => {
                            setEntityId(e.id);
                            setEntityData({ ...e, ...e.metadata });
                            setIsEntityDialogOpen(false);
                          }}
                        >
                          <div className="flex-1">
                            <div className="font-semibold">{e.display_name}</div>
                            <div className="text-xs text-slate-500">{e.subtype}</div>
                          </div>
                          {entityId === e.id && <Check className="h-4 w-4 text-blue-500" />}
                        </Button>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport} disabled={!activeTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {saveM.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            {/* Left Toolbar */}
            <aside className="w-16 border-r bg-white flex flex-col items-center py-4 gap-4">
              <Button variant="ghost" size="icon" onClick={() => addLayer("text")} title="Adicionar Texto">
                <Type className="h-6 w-6" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => addLayer("image")} title="Adicionar Imagem">
                <ImageIcon className="h-6 w-6" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => addLayer("shape")} title="Adicionar Forma">
                <Square className="h-6 w-6" />
              </Button>
            </aside>

            {/* Main Editor */}
            <main className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center p-20 relative">
              <div className="absolute top-4 left-4 bg-white/80 backdrop-blur rounded-xl p-2 flex gap-2 border shadow-sm">
                <span className="text-xs font-semibold px-2 py-1">Tamanho:</span>
                {templatesQ.data?.map(t => (
                  <Badge 
                    key={t.id} 
                    variant={activeTemplate?.id === t.id ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handleTemplateSelect(t)}
                  >
                    {t.name}
                  </Badge>
                ))}
                
                <div className="mx-2 w-px h-4 bg-slate-200" />
                
                <Button 
                  variant={orientation === "vertical" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-7 px-2 rounded-lg gap-1 text-[10px]"
                  onClick={() => toggleOrientation("vertical")}
                >
                  <Smartphone className="h-3 w-3" />
                  Vertical
                </Button>
                <Button 
                  variant={orientation === "horizontal" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-7 px-2 rounded-lg gap-1 text-[10px]"
                  onClick={() => toggleOrientation("horizontal")}
                >
                  <Monitor className="h-3 w-3" />
                  Horizontal
                </Button>
              </div>

              {activeTemplate && (
                <MediaKitCanvas
                  ref={canvasRef}
                  layers={layers}
                  width={editorDimensions.width}
                  height={editorDimensions.height}
                  selectedLayerId={selectedLayerId}
                  onSelectLayer={setSelectedLayerId}
                  onUpdateLayer={updateLayer}
                  scale={0.4}
                  entityData={entityData}
                />
              )}
            </main>

            {/* Right Properties Panel */}
            <aside className="w-80 border-l bg-white overflow-y-auto">
              <div className="p-6 space-y-8">
                {selectedLayer ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 capitalize">{selectedLayer.type} Props</h3>
                      <Button variant="destructive" size="icon" onClick={() => removeLayer(selectedLayer.id)} className="h-8 w-8 rounded-full">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {selectedLayer.type === "text" && (
                        <>
                          <div className="space-y-2">
                            <Label>Conteúdo</Label>
                            <Input 
                              value={selectedLayer.content} 
                              onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })} 
                            />
                            <p className="text-[10px] text-slate-400">Use {"{{campo}}"} para info da entidade</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Tamanho da Fonte: {selectedLayer.fontSize}px</Label>
                            <Slider 
                              value={[selectedLayer.fontSize || 16]} 
                              min={12} max={200} step={1}
                              onValueChange={([v]) => updateLayer(selectedLayer.id, { fontSize: v })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Cor</Label>
                            <Input 
                              type="color" 
                              value={selectedLayer.color} 
                              onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })} 
                            />
                          </div>
                        </>
                      )}

                      {(selectedLayer.type === "image" || selectedLayer.type === "shape") && (
                        <>
                          {selectedLayer.type === "image" && (
                             <div className="space-y-2">
                              <Label>URL da Imagem</Label>
                              <Input 
                                value={selectedLayer.content} 
                                onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })} 
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Largura</Label>
                              <Input 
                                type="number"
                                value={selectedLayer.width} 
                                onChange={(e) => updateLayer(selectedLayer.id, { width: parseInt(e.target.value) })} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Altura</Label>
                              <Input 
                                type="number"
                                value={selectedLayer.height} 
                                onChange={(e) => updateLayer(selectedLayer.id, { height: parseInt(e.target.value) })} 
                              />
                            </div>
                          </div>
                          {selectedLayer.type === "shape" && (
                             <div className="space-y-2">
                              <Label>Cor de Fundo</Label>
                              <Input 
                                type="color" 
                                value={selectedLayer.color} 
                                onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })} 
                              />
                            </div>
                          )}
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Posição X</Label>
                          <Input 
                            type="number"
                            value={selectedLayer.x} 
                            onChange={(e) => updateLayer(selectedLayer.id, { x: parseInt(e.target.value) })} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Posição Y</Label>
                          <Input 
                            type="number"
                            value={selectedLayer.y} 
                            onChange={(e) => updateLayer(selectedLayer.id, { y: parseInt(e.target.value) })} 
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-20">
                    <Layers className="h-12 w-12 text-slate-200 mb-4" />
                    <h3 className="text-slate-900 font-semibold text-sm">Selecione um elemento</h3>
                    <p className="text-slate-500 text-xs">Para editar suas propriedades</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
