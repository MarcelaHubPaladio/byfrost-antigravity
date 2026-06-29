const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30Case.tsx', 'utf-8');

// Import
content = content.replace(
    'import { useQuery, useQueryClient } from "@tanstack/react-query";',
    'import { useQuery, useQueryClient } from "@tanstack/react-query";\nimport { useAcquireM30CaseLock } from "@/hooks/useM30CasePresence";\nimport { Lock } from "lucide-react";'
);

// Call hook
content = content.replace(
    '    const [deleting, setDeleting] = useState(false);',
    '    const [deleting, setDeleting] = useState(false);\n    const lockInfo = useAcquireM30CaseLock(activeTenantId, id || null, user as any);'
);

// Block UI if locked
const blockUI = `
    if (lockInfo.status === "locked" && lockInfo.lockedBy) {
        return (
            <RequireAuth>
                <AppShell>
                    <div className="flex h-[calc(100vh-100px)] items-center justify-center p-6 animate-in fade-in zoom-in duration-500">
                        <Card className="max-w-md w-full p-8 text-center flex flex-col items-center gap-6 shadow-2xl shadow-indigo-900/10 border-indigo-100 bg-gradient-to-b from-white to-indigo-50/50 rounded-[32px]">
                            <div className="h-20 w-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center animate-pulse">
                                <Lock className="h-10 w-10" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Caso em Edição</h2>
                                <p className="text-sm text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                                    <strong className="text-indigo-600">{lockInfo.lockedBy.userName}</strong> está editando este caso neste momento. 
                                    Para evitar conflitos de dados, você não pode acessar agora.
                                </p>
                            </div>
                            <Button 
                                className="w-full rounded-2xl h-12 font-bold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                                onClick={() => nav("/app/operacao-m30")}
                            >
                                Voltar para a Lista
                            </Button>
                        </Card>
                    </div>
                </AppShell>
            </RequireAuth>
        );
    }
`;

content = content.replace(
    '    if (caseQ.isLoading) {',
    blockUI + '\n    if (caseQ.isLoading) {'
);

fs.writeFileSync('src/pages/OperacaoM30Case.tsx', content);
