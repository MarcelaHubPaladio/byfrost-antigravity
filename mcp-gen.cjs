const fs = require('fs');
const files = [
  { name: 'index.ts', path: 'supabase/functions/beeia-extract-learnings/index.ts' },
  { name: '../_shared/cors.ts', path: 'supabase/functions/_shared/cors.ts' },
  { name: '../_shared/supabaseAdmin.ts', path: 'supabase/functions/_shared/supabaseAdmin.ts' },
  { name: '../_shared/llm.ts', path: 'supabase/functions/_shared/llm.ts' },
  { name: '../_shared/billing.ts', path: 'supabase/functions/_shared/billing.ts' }
];
const payload = files.map(f => ({ name: f.name, content: fs.readFileSync(f.path, 'utf8') }));
fs.writeFileSync('mcp-payload.json', JSON.stringify(payload));
