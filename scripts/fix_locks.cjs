const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30.tsx', 'utf-8');

// Insert locks declaration
content = content.replace(
    '  const qc = useQueryClient();',
    '  const qc = useQueryClient();\n  const locks = useM30CasePresence(activeTenantId);'
);

fs.writeFileSync('src/pages/OperacaoM30.tsx', content);
