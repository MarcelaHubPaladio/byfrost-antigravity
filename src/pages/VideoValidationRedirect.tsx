import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function VideoValidationRedirect() {
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    async function fetchVideo() {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from('video_validations')
          .select('video_path, status')
          .eq('id', id)
          .maybeSingle();

        if (data && data.video_path) {
          const { data: publicUrlData } = supabase.storage
            .from('video_validations')
            .getPublicUrl(data.video_path);
            
          if (publicUrlData?.publicUrl) {
            window.location.href = publicUrlData.publicUrl;
            return;
          }
        }
        
        // Fallback or error
        console.error("Video not found or error:", error);
      } catch (e) {
        console.error("Redirect error", e);
      }
    }
    fetchVideo();
  }, [id]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <div className="text-center flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <h2 className="text-xl font-semibold">Buscando seu vídeo...</h2>
        <p className="text-slate-500">Você será redirecionado em instantes.</p>
      </div>
    </div>
  );
}
