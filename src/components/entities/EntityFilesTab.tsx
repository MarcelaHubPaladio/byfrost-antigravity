import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/utils/toast";
import { Trash2, Download, FileText, UploadCloud, Eye } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/core/ConfirmDeleteDialog";

type EntityFilesTabProps = {
  tenantId: string;
  entityId: string;
};

export function EntityFilesTab({ tenantId, entityId }: EntityFilesTabProps) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("nfe");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filesQ = useQuery({
    queryKey: ["entity_files", tenantId, entityId],
    enabled: Boolean(tenantId && entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entity_files")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate type (png, jpg, pdf)
    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
    const filesToUpload = Array.from(files).filter(file => allowedTypes.includes(file.type));

    if (filesToUpload.length !== files.length) {
      showError("Apenas arquivos PNG, JPG e PDF são permitidos. Arquivos inválidos foram ignorados.");
    }
    
    if (filesToUpload.length === 0) {
      e.target.value = '';
      return;
    }

    setUploading(true);
    let successCount = 0;

    try {
      for (const file of filesToUpload) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const storagePath = `${tenantId}/${entityId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("entity-files")
          .upload(storagePath, file, { upsert: true });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw new Error(`Falha no upload do arquivo ${file.name}`);
        }

        const { error: dbError } = await supabase.from("core_entity_files").insert({
          tenant_id: tenantId,
          entity_id: entityId,
          file_type: selectedType,
          status: "pending",
          storage_path: storagePath,
          original_filename: file.name,
          content_type: file.type,
        });

        if (dbError) {
          console.error("Database insert error:", dbError);
          throw new Error(`Falha ao registrar o arquivo ${file.name} no banco.`);
        }
        successCount++;
      }

      if (successCount > 0) {
        showSuccess(`${successCount} arquivo(s) enviado(s) com sucesso!`);
        await qc.invalidateQueries({ queryKey: ["entity_files", tenantId, entityId] });
      }
    } catch (err: any) {
      showError(err?.message || "Erro ao fazer upload dos arquivos.");
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "pending" : "paid";
    try {
      const { error } = await supabase
        .from("core_entity_files")
        .update({ status: newStatus })
        .eq("tenant_id", tenantId)
        .eq("id", id);

      if (error) throw error;
      showSuccess(`Status alterado para ${newStatus === 'paid' ? 'Pago' : 'Pendente'}.`);
      await qc.invalidateQueries({ queryKey: ["entity_files", tenantId, entityId] });
    } catch (err: any) {
      showError(err?.message || "Erro ao alterar status.");
    }
  };

  const onDelete = async () => {
    if (!deletingId) return;
    try {
      // We do soft delete as required by schema
      const { error } = await supabase
        .from("core_entity_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", deletingId);

      if (error) throw error;
      showSuccess("Arquivo excluído.");
      await qc.invalidateQueries({ queryKey: ["entity_files", tenantId, entityId] });
    } catch (err: any) {
      showError(err?.message || "Erro ao excluir arquivo.");
    } finally {
      setDeletingId(null);
    }
  };

  const getFileUrl = async (path: string, download = false) => {
    const { data, error } = await supabase.storage.from("entity-files").createSignedUrl(path, 3600, { download });
    if (error) {
      showError("Erro ao gerar link do arquivo.");
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-slate-200 p-4 shadow-sm bg-white/70 backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Upload de Arquivo</h3>
            <p className="text-xs text-slate-500 mt-1">
              Envie notas fiscais (NFe), boletos e outros documentos (PDF, PNG, JPG).
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="w-full sm:w-[150px]">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-9 w-full rounded-xl text-xs bg-white border-slate-200">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="nfe">NFe</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="relative w-full sm:w-auto">
              <Input 
                type="file" 
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                onChange={onFileUpload}
                accept="image/png, image/jpeg, application/pdf"
                disabled={uploading}
              />
              <Button disabled={uploading} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 h-9">
                <UploadCloud className="h-4 w-4 mr-2" />
                {uploading ? "Enviando..." : "Enviar Arquivo"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Arquivo</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Tipo</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Data</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-400 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filesQ.data?.map((file) => (
                <TableRow key={file.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-xs text-slate-700 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <span className="truncate max-w-[200px]" title={file.original_filename || "Arquivo"}>
                      {file.original_filename || "Arquivo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-bold uppercase">
                      {file.file_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={file.status === "paid"}
                        onCheckedChange={() => toggleStatus(file.id, file.status)}
                        className="scale-75 data-[state=checked]:bg-emerald-500"
                      />
                      <span className={`text-xs font-semibold ${file.status === 'paid' ? 'text-emerald-600' : 'text-amber-500'}`}>
                        {file.status === 'paid' ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(file.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                      onClick={() => getFileUrl(file.storage_path, false)}
                      title="Visualizar"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                      onClick={() => getFileUrl(file.storage_path, true)}
                      title="Baixar"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                      onClick={() => setDeletingId(file.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!filesQ.isLoading && filesQ.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-400 text-sm">
                    Nenhum arquivo encontrado para esta entidade.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ConfirmDeleteDialog
        open={Boolean(deletingId)}
        onOpenChange={(v) => !v && setDeletingId(null)}
        title="Excluir Arquivo"
        description="Tem certeza que deseja excluir este arquivo? (Ele não aparecerá mais aqui)"
        onConfirm={onDelete}
      />
    </div>
  );
}
