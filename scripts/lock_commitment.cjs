const fs = require('fs');

let content = fs.readFileSync('src/pages/CommitmentDetail.tsx', 'utf-8');

// Imports
content = content.replace(
    'import { useQuery, useQueryClient } from "@tanstack/react-query";',
    'import { useQuery, useQueryClient } from "@tanstack/react-query";\nimport { useM30CasePresence } from "@/hooks/useM30CasePresence";\nimport { Lock } from "lucide-react";'
);

// Call hook
content = content.replace(
    '    const qc = useQueryClient();',
    '    const qc = useQueryClient();\n    const locks = useM30CasePresence(activeTenantId);'
);

// Add lock icon in the render
const oldCardTitle = `                                            <span className="text-sm font-semibold text-slate-800 line-clamp-1">
                                                {c.title}
                                            </span>`;
const newCardTitle = `                                            <span className="text-sm font-semibold text-slate-800 line-clamp-1 flex items-center gap-2">
                                                {c.title}
                                                {locks[c.id] && (
                                                    <span className="text-rose-600 shrink-0" title={\`Em edição por \${locks[c.id].userName}\`}>
                                                        <Lock className="h-3 w-3" />
                                                    </span>
                                                )}
                                            </span>`;
content = content.replace(oldCardTitle, newCardTitle);

fs.writeFileSync('src/pages/CommitmentDetail.tsx', content);
