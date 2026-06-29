const fs = require('fs');
let content = fs.readFileSync('src/pages/OperacaoM30Case.tsx', 'utf-8');
content = content.replace(
    '{caseQ.data?.case_type === "planejamento" && (',
    '{(caseQ.data?.case_type === "planejamento" || caseQ.data?.case_type === "gravacao") && ('
);
fs.writeFileSync('src/pages/OperacaoM30Case.tsx', content);
