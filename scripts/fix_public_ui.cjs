const fs = require('fs');

let content = fs.readFileSync('src/pages/PublicScriptApproval.tsx', 'utf-8');

// Fix buttons layout on mobile
content = content.replace(
    '<div className="flex items-center gap-2 pt-2 border-t border-slate-800/50">',
    '<div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/50">'
);

// Add a specific save button for subtask data
const btnCode = `
                                            <div className="pt-4 flex flex-col sm:flex-row gap-3">
                                                <Button 
                                                    onClick={async () => {
                                                        if (!token) return;
                                                        setApproving(true);
                                                        try {
                                                            const payload = { ...subtasks[idx], ...(subtaskData[idx] || {}) };
                                                            await supabase.rpc('update_public_m30_subtask_meta', { p_token: token, p_idx: idx, p_subtask: payload });
                                                            showSuccess("Observações salvas!");
                                                            fetchCase();
                                                        } catch (e) {
                                                            showError("Falha ao salvar.");
                                                        } finally {
                                                            setApproving(false);
                                                        }
                                                    }}
                                                    disabled={approving}
                                                    variant="outline"
                                                    className="w-full sm:w-1/2 h-12 rounded-2xl font-bold text-xs shadow-sm bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                                                >
                                                    SALVAR RASCUNHO 💾
                                                </Button>

                                                <Button 
                                                    onClick={() => saveAndApproveSubtask(idx)}
                                                    disabled={approving}
                                                    style={{ backgroundColor: primaryColor, color: primaryText }}
                                                    className="w-full sm:w-1/2 h-12 rounded-2xl font-black text-xs shadow-lg transition-all active:scale-95 gap-3 hover:opacity-90"
                                                >
                                                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    APROVAR ESTE VÍDEO ✅
                                                </Button>
                                            </div>
`;

content = content.replace(
    '<div className="pt-4">\n                                                <Button \n                                                    onClick={() => saveAndApproveSubtask(idx)}\n                                                    disabled={approving}\n                                                    style={{ backgroundColor: primaryColor, color: primaryText }}\n                                                    className="w-full h-12 rounded-2xl font-black text-xs shadow-lg transition-all active:scale-95 gap-3 hover:opacity-90"\n                                                >\n                                                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}\n                                                    APROVAR ESTE VÍDEO ✅\n                                                </Button>\n                                            </div>',
    btnCode
);

fs.writeFileSync('src/pages/PublicScriptApproval.tsx', content);
