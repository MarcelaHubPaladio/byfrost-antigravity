const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30.tsx', 'utf-8');

// Replace minutesAgo definition
const oldMinutesAgo = `function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}`;

const newFormatDate = `function formatCaseDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) {
    return \`Hoje às \${format(d, 'HH:mm')}\`;
  }
  return format(d, "dd/MM/yyyy 'às' HH:mm");
}`;

content = content.replace(oldMinutesAgo, newFormatDate);

// Replace age definition
content = content.replace(
    'const age = minutesAgo(c.updated_at);',
    'const age = formatCaseDate(c.updated_at);'
);

// Replace {age} min render
content = content.replace(
    '{age} min',
    '{age}'
);

fs.writeFileSync('src/pages/OperacaoM30.tsx', content);
