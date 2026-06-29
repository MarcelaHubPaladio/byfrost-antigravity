const fs = require('fs');

let content = fs.readFileSync('src/pages/PublicScriptApproval.tsx', 'utf-8');

content = content.replace(
    "const isGravacaoCase = caseData?.state?.toLowerCase().includes('grava') || caseData?.journey_name?.toLowerCase().includes('grava');",
    "const isGravacaoCase = caseData?.case_type === 'gravacao' || caseData?.state?.toLowerCase().includes('grava') || caseData?.journey_name?.toLowerCase().includes('grava');"
);

// We need to also allow checking if the specific subtask is gravacao
content = content.replace(
    /isGravacaoCase/g,
    "isGravacaoCase" // Just keep it, but we also want to support st.type. Actually the user just said they changed the parent case type to gravacao.
);

fs.writeFileSync('src/pages/PublicScriptApproval.tsx', content);
