import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Plus, 
  Search,
  Loader2
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

type Asset = {
  id: string;
  name: string;
  url: string;
};

type MediaKitGalleryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
};

export function MediaKitGallery({ open, onOpenChange, onSelect }: MediaKitGalleryProps) {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const assetsQ = useQuery({
    queryKey: ["media_kit_assets", activeTenantId, searchTerm],
    enabled: !!activeTenantId && open,
    queryFn: async () => {
      let query = supabase
        .from("media_kit_assets")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      
      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Asset[];
    },
  });

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${activeTenantId}/${fileName}`;

        // 1. Upload to Storage
        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('media_kit_assets')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('media_kit_assets')
          .getPublicUrl(filePath);

        // 3. Save to DB
        const { error: dbError } = await supabase
          .from('media_kit_assets')
          .insert([{
            tenant_id: activeTenantId!,
            name: file.name,
            url: publicUrl
          }]);

        if (dbError) throw dbError;
        
        return publicUrl;
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kit_assets"] });
      showSuccess("Imagem enviada com sucesso!");
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('media_kit_assets')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kit_assets"] });
      showSuccess("Imagem removida");
    },
    onError: (err: any) => showError(err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadM.mutate(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-blue-600" />
            Galeria de Imagens
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 border-b bg-slate-50 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar imagens..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          <Button variant="outline" className="rounded-xl relative overflow-hidden" disabled={isUploading}>
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Fazer Upload
            <input 
              type="file" 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              accept="image/*"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scroll-area custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {assetsQ.data?.map((asset) => (
              <div 
                key={asset.id} 
                className="group relative aspect-square rounded-xl border overflow-hidden bg-slate-100 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                onClick={() => {
                  onSelect(asset.url);
                  onOpenChange(false);
                }}
              >
                <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-2 bg-black/50 text-white text-[10px] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {asset.name}
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteM.mutate(asset.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {assetsQ.data?.length === 0 && !assetsQ.isLoading && (
              <div className="col-span-full py-12 text-center text-slate-400">
                {searchTerm ? "Nenhuma imagem encontrada." : "Nenhuma imagem na galeria. Faça o primeiro upload!"}
              </div>
            )}
            {assetsQ.isLoading && (
              <div className="col-span-full py-12 text-center text-slate-400">
                Carregando imagens...
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-slate-50">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
