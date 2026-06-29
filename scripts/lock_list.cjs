const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30.tsx', 'utf-8');

// Imports
content = content.replace(
    'import { useQuery, useQueryClient } from "@tanstack/react-query";',
    'import { useQuery, useQueryClient } from "@tanstack/react-query";\nimport { useM30CasePresence } from "@/hooks/useM30CasePresence";\nimport { Lock } from "lucide-react";'
);

// Call hook
content = content.replace(
    '  const [isKanbanConfigOpen, setIsKanbanConfigOpen] = useState(false);',
    '  const [isKanbanConfigOpen, setIsKanbanConfigOpen] = useState(false);\n  const locks = useM30CasePresence(activeTenantId);'
);

// Inject lock UI inside the Kanban Card
const oldCardHeader = `                                <div className="min-w-0 flex-1 pr-1">
                                  <div className="truncate text-sm font-semibold text-slate-900">{titlePrimary}</div>`;

const newCardHeader = `                                <div className="min-w-0 flex-1 pr-1">
                                  <div className="flex items-center gap-2">
                                    <div className="truncate text-sm font-semibold text-slate-900">{titlePrimary}</div>
                                    {locks[c.id] && (
                                      <div className="flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] uppercase font-bold text-rose-600 ring-1 ring-inset ring-rose-500/20" title={\`Sendo editado por \${locks[c.id].userName}\`}>
                                        <Lock className="h-3 w-3" /> Em Edição
                                      </div>
                                    )}
                                  </div>`;

content = content.replace(oldCardHeader, newCardHeader);

fs.writeFileSync('src/pages/OperacaoM30.tsx', content);
