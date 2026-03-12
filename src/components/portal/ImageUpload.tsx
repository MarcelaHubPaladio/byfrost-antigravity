import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
  label?: string;
}

export function ImageUpload({ value, onChange, className, label }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        toast.error("Por favor, selecione uma imagem.");
        return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        toast.error("A imagem deve ter no máximo 5MB.");
        return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `portal-assets/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-assets')
        .getPublicUrl(filePath);

      onChange(publicUrl);
      toast.success("Imagem enviada com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar imagem");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && <label className="text-[10px] uppercase text-slate-400 font-bold">{label}</label>}
      
      <div className="relative group">
        {value ? (
          <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img 
              src={value} 
              alt="Preview" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-8 rounded-lg"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Trocar"}
                </Button>
                <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-8 rounded-lg"
                    onClick={() => onChange("")}
                >
                    Remover
                </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full aspect-video rounded-xl border-dashed border-2 flex flex-col gap-2 h-auto py-8"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            ) : (
              <>
                <div className="p-3 bg-slate-50 rounded-full">
                  <Upload className="h-5 w-5 text-slate-400" />
                </div>
                <span className="text-xs font-medium text-slate-500">Clique para enviar imagem</span>
              </>
            )}
          </Button>
        )}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleUpload}
        />
      </div>
    </div>
  );
}
