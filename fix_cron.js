const fs = require('fs');
const file = 'supabase/functions/cron-runner/index.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(/}, { onConflict: "tenant_id, idempotency_key", ignoreDuplicates: true }\n\s*\}\);/g, '}, { onConflict: "tenant_id, idempotency_key", ignoreDuplicates: true });');
fs.writeFileSync(file, code);
