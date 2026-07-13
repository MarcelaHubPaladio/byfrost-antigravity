const fs = require('fs');
const path = require('path');

const funcName = "webhooks-zapi-inbound";
const funcDir = path.join(__dirname, 'supabase', 'functions', funcName);
const sharedDir = path.join(__dirname, 'supabase', 'functions', '_shared');

const files = [];

// Read index.ts
files.push({
  name: 'index.ts',
  content: fs.readFileSync(path.join(funcDir, 'index.ts'), 'utf8')
});

// Read _shared
const sharedFiles = fs.readdirSync(sharedDir).filter(f => f.endsWith('.ts'));
sharedFiles.forEach(f => {
  files.push({
    name: `../_shared/${f}`,
    content: fs.readFileSync(path.join(sharedDir, f), 'utf8')
  });
});

const payload = {
  project_id: "pryoirzeghatrgecwrci",
  name: funcName,
  entrypoint_path: "index.ts",
  verify_jwt: false,
  files: files
};

fs.writeFileSync('mcp-payload-zapi.json', JSON.stringify(payload, null, 2));
console.log('Generated mcp-payload-zapi.json');
