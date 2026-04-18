import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { 
  File, 
  FileArchive, 
  FileCode, 
  FileImage, 
  FileText, 
  Folder, 
  FolderPlus,
  MoreVertical,
  Plus,
  Trash2,
  Download,
  ChevronRight,
  Loader2,
  FileIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type ProcessFile = {
  id: string;
  tenant_id: string;
  process_id: string;
  file_path: string;
  file_name: string;
  folder_path: string;
  created_at: string;
};

export function ProcessFileGallery({ processId }: { processId: string }) {
  const qc = useQueryClient();
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const roleKey = activeTenant?.role ?? "";
  const isAdmin = roleKey === "admin";
  const [currentPath, setCurrentPath] = useState("/"); // e.g. "/", "/Marketing/", "/Marketing/Social/"

  const filesQ = useQuery({
    queryKey: ["process_files", processId],
    enabled: !!processId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_files")
        .select("*")
        .eq("process_id", processId)
        .order("file_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProcessFile[];
    },
  });

  const canManage = isAdmin || isSuperAdmin;

  const { items, folders } = useMemo(() => {
    const list = filesQ.data ?? [];
    const currentFiles = list.filter(f => f.folder_path === currentPath);
    
    // Find subfolders in current path
    const allFolders = list.map(f => f.folder_path);
    const subFolders = Array.from(new Set(
      allFolders
        .filter(p => p.startsWith(currentPath) && p !== currentPath)
        .map(p => {
          const relative = p.slice(currentPath.length);
          const firstPart = relative.split("/")[0];
          return firstPart;
        })
        .filter(Boolean)
    ));

    return { items: currentFiles, folders: subFolders };
  }, [filesQ.data, currentPath]);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    const result = [{ name: "Início", path: "/" }];
    let acc = "/";
    parts.forEach(p => {
      acc += `${p}/`;
      result.push({ name: p, path: acc });
    });
    return result;
  }, [currentPath]);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "svg"].includes(ext!)) return <FileImage className="h-4 w-4 text-blue-500" />;
    if (["pdf", "doc", "docx", "txt"].includes(ext!)) return <FileText className="h-4 w-4 text-rose-500" />;
    if (["zip", "rar", "7z"].includes(ext!)) return <FileArchive className="h-4 w-4 text-amber-500" />;
    return <File className="h-4 w-4 text-slate-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scroll-area-none">
          {breadcrumbs.map((bc, idx) => (
            <div key={idx} className="flex items-center shrink-0">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-300 mx-0.5" />}
              <button 
                onClick={() => setCurrentPath(bc.path)}
                className={cn(
                  "px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100",
                  currentPath === bc.path ? "text-slate-900 bg-slate-100" : "text-slate-500"
                )}
              >
                {bc.name}
              </button>
            </div>
          ))}
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 rounded-xl px-3 border-slate-200 text-xs font-semibold">
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" /> Nova Pasta
            </Button>
            <Button size="sm" className="h-8 rounded-xl px-3 bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Enviar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {folders.map(folder => (
          <button
            key={folder}
            onClick={() => setCurrentPath(`${currentPath}${folder}/`)}
            className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100 transition-colors text-left group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200 group-hover:ring-[hsl(var(--byfrost-accent)/0.3)]">
              <Folder className="h-5 w-5 text-amber-400 fill-amber-400/20" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{folder}</div>
              <div className="text-[10px] text-slate-400 whitespace-nowrap">Pasta</div>
            </div>
          </button>
        ))}

        {items.map(file => (
          <div
            key={file.id}
            className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-200 hover:ring-[hsl(var(--byfrost-accent)/0.3)] transition-all group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                {getFileIcon(file.file_name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900" title={file.file_name}>{file.file_name}</div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(file.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-60 hover:opacity-100">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-slate-100">
                <DropdownMenuItem className="rounded-lg text-xs font-medium cursor-pointer" onClick={() => window.open(file.file_path, "_blank")}>
                  <Download className="mr-2 h-3.5 w-3.5" /> Baixar
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem className="rounded-lg text-xs font-medium text-rose-600 bg-rose-50/0 hover:bg-rose-50 cursor-pointer">
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}

        {folders.length === 0 && items.length === 0 && !filesQ.isLoading && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 rounded-[28px] bg-slate-50/10">
            <Folder className="mx-auto h-10 w-10 text-slate-200 mb-2" />
            <p className="text-sm font-medium text-slate-400">Esta pasta está vazia.</p>
          </div>
        )}

        {filesQ.isLoading && (
          <div className="col-span-full py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 text-slate-300 animate-spin" />
            <p className="mt-2 text-xs text-slate-400 font-medium">Carregando arquivos...</p>
          </div>
        )}
      </div>
    </div>
  );
}
