import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { showError, showSuccess } from "@/utils/toast";
import { Image as ImageIcon, Plus, Trash2, Star, Loader2, UploadCloud } from "lucide-react";
import imageCompression from "browser-image-compression";
import { RoomTypeManager } from "./RoomTypeManager";
import { Settings2 } from "lucide-react";

const DEFAULT_ROOMS = ["Geral", "Sala", "Cozinha", "Banheiro"];

export function RoomPhotoManager({ tenantId, entityId }: { tenantId: string; entityId: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<string>("Geral");
  const [managerOpen, setManagerOpen] = useState(false);

  const roomTypesQ = useQuery({
    queryKey: ["room_types", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_property_room_types")
        .select("*")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const availableRooms = roomTypesQ.data && roomTypesQ.data.length > 0 
    ? roomTypesQ.data.map(r => r.name) 
    : DEFAULT_ROOMS;

  const photosQ = useQuery({
    queryKey: ["entity_photos", tenantId, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entity_photos")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      setProgress(10);
      
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      };
      
      const compressed = await imageCompression(file, options);
      setProgress(40);
      
      const ext = file.name.split(".").pop();
      const path = `${tenantId}/${entityId}/${crypto.randomUUID()}.${ext}`;
      
      const { error: upErr } = await supabase.storage
        .from("media_kit_assets") 
        .upload(path, compressed);
        
      if (upErr) throw upErr;
      setProgress(80);
      
      const { data: { publicUrl } } = supabase.storage
        .from("media_kit_assets")
        .getPublicUrl(path);
        
      const { error: insErr } = await supabase
        .from("core_entity_photos")
        .insert({
          tenant_id: tenantId,
          entity_id: entityId,
          room_type: selectedRoom,
          url: publicUrl,
        });
        
      if (insErr) throw insErr;
      setProgress(100);
    },
    onSuccess: () => {
      showSuccess("Foto adicionada!");
      qc.invalidateQueries({ queryKey: ["entity_photos"] });
      setUploading(false);
      setProgress(0);
    },
    onError: (e: any) => {
      showError(e.message || "Erro ao fazer upload");
      setUploading(false);
      setProgress(0);
    }
  });

  const deletePhoto = async (id: string) => {
    if (!confirm("Remover esta foto?")) return;
    try {
      const { error } = await supabase
        .from("core_entity_photos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["entity_photos"] });
      showSuccess("Foto removida.");
    } catch (e: any) {
      showError(e.message);
    }
  };

  const setMainPhoto = async (photo: any) => {
    try {
      // 1) Reset all main for this entity
      await supabase
        .from("core_entity_photos")
        .update({ is_main: false })
        .eq("entity_id", entityId)
        .eq("tenant_id", tenantId);
        
      // 2) Set this one as main
      const { error } = await supabase
        .from("core_entity_photos")
        .update({ is_main: true })
        .eq("id", photo.id);
        
      if (error) throw error;

      // 3) Update core_entities metadata to keep photo_url in sync if needed
      await supabase
        .from("core_entities")
        .update({
          metadata: {
            ...(await supabase.from("core_entities").select("metadata").eq("id", entityId).single()).data?.metadata,
            photo_url: photo.url
          }
        })
        .eq("id", entityId);

      qc.invalidateQueries({ queryKey: ["entity_photos"] });
      qc.invalidateQueries({ queryKey: ["entity"] });
      showSuccess("Foto principal definida.");
    } catch (e: any) {
      showError(e.message);
    }
  };

  const grouped = useMemo(() => {
    const res: Record<string, any[]> = {};
    (photosQ.data || []).forEach(p => {
      if (!res[p.room_type]) res[p.room_type] = [];
      res[p.room_type].push(p);
    });
    return res;
  }, [photosQ.data]);

  return (
    <div className="space-y-6">
      <Card className="p-6 rounded-3xl border-slate-200 bg-indigo-50/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase">Cômodo / Categoria</Label>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger className="rounded-xl h-11 bg-white">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {availableRooms.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button 
               variant="outline" 
               size="icon" 
               className="h-11 w-11 rounded-xl border-slate-200 text-slate-400 hover:text-indigo-600"
               onClick={() => setManagerOpen(true)}
               title="Gerenciar categorias/cômodos"
            >
               <Settings2 className="w-4 h-4" />
            </Button>
            <Button disabled={uploading} className="h-11 rounded-xl gap-2 w-full md:w-auto overflow-hidden relative">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {uploading ? "Enviando..." : "Adicionar Foto"}
              <input 
                type="file" 
                accept="image/*" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) uploadMutation.mutate(f);
                }}
              />
            </Button>
          </div>
        </div>
        {uploading && (
          <div className="mt-4 space-y-1">
            <Progress value={progress} className="h-1.5" />
            <div className="text-[10px] text-slate-400 text-right">{progress}%</div>
          </div>
        )}
      </Card>

      <div className="space-y-8">
        {Object.entries(grouped).map(([room, items]) => (
          <div key={room} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-700">{room}</h3>
              <Badge variant="secondary" className="rounded-lg text-[10px] h-5">{items.length}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {items.map(p => (
                <div key={p.id} className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
                  <img src={p.url} className="w-full h-full object-cover" />
                  
                  {p.is_main && (
                    <div className="absolute top-2 left-2 bg-yellow-400 text-white p-1 rounded-lg">
                      <Star className="w-3 h-3 fill-current" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {!p.is_main && (
                      <Button size="icon" variant="secondary" className="h-8 w-8 rounded-lg" onClick={() => setMainPhoto(p)} title="Definir como principal">
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="destructive" className="h-8 w-8 rounded-lg" onClick={() => deletePhoto(p.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!photosQ.isLoading && photosQ.data?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50 grayscale">
            <ImageIcon className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-sm text-slate-500 italic">Nenhuma foto adicionada.</p>
          </div>
        )}
      </div>

      <RoomTypeManager 
        tenantId={tenantId} 
        open={managerOpen} 
        onOpenChange={setManagerOpen} 
      />
    </div>
  );
}
