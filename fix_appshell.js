const fs = require('fs');
let code = fs.readFileSync('src/components/AppShell.tsx', 'utf8');

// 1. DesktopHoverMenuLink
code = code.replace(
  'function DesktopHoverMenuLink({',
  'function DesktopHoverMenuLink({\n  to,\n  label,\n  icon: Icon,\n  active,\n  disabled,\n}: {\n  to: string;\n  label: string;\n  icon: any;\n  active: boolean;\n  disabled: boolean;\n}) {\n  if (disabled) return null;\n\n  return (\n'
);
// Remove the old implementation signature to avoid duplicates
code = code.replace(/function DesktopHoverMenuLink\(\{[\s\S]*?disabled: boolean;\n\}\) \{/, 'function OldDesktopHoverMenuLink() {');
code = code.replace('function OldDesktopHoverMenuLink() {', ''); // clean up the replaced part

// Let's use a simpler string replacement:
code = fs.readFileSync('src/components/AppShell.tsx', 'utf8');

code = code.replace(
  '  disabled: boolean;\n}) {\n  return (\n    <NavLink',
  '  disabled: boolean;\n}) {\n  if (disabled) return null;\n  return (\n    <NavLink'
);

code = code.replace(
  '  onClick?: (e: React.MouseEvent) => void;\n}) {\n  const base = "mx-auto',
  '  onClick?: (e: React.MouseEvent) => void;\n}) {\n  if (disabled) return null;\n  const base = "mx-auto'
);

code = code.replace(
  '  onNavigate: () => void;\n}) {\n  if (disabled) {',
  '  onNavigate: () => void;\n}) {\n  if (disabled) return null;\n  if (false) {'
);

code = code.replace(
  '  children: React.ReactNode;\n}) {\n  return (\n    <HoverCardPrimitive.Root',
  '  children: React.ReactNode;\n  disabled?: boolean;\n}) {\n  if (disabled) return null;\n  return (\n    <HoverCardPrimitive.Root'
);

// Now update DesktopHoverMenu usages
code = code.replace(
  '<DesktopHoverMenu\n                    title="M30"\n                    trigger={<div className="w-full"><NavTile to="/app/operacao-m30" icon={Users} label="Clientes M30" disabled={!can("app.operacao_m30")} /></div>}',
  '<DesktopHoverMenu\n                    title="M30"\n                    disabled={!can("app.operacao_m30")}\n                    trigger={<div className="w-full"><NavTile to="/app/operacao-m30" icon={Users} label="Clientes M30" /></div>}'
);

code = code.replace(
  '<DesktopHoverMenu\n                    title="Criar"\n                    trigger={<div className="w-full"><NavTile to="/app/create" icon={Zap} label="Criar" disabled={false} /></div>}',
  '<DesktopHoverMenu\n                    title="Criar"\n                    disabled={false}\n                    trigger={<div className="w-full"><NavTile to="/app/create" icon={Zap} label="Criar" /></div>}'
);

code = code.replace(
  '<DesktopHoverMenu\n                    title="Core"\n                    trigger={<div className="w-full"><NavTile to="/app/entities" icon={Building2} label="Core" disabled={!can("app.entities")} /></div>}',
  '<DesktopHoverMenu\n                    title="Core"\n                    disabled={!can("app.entities")}\n                    trigger={<div className="w-full"><NavTile to="/app/entities" icon={Building2} label="Core" /></div>}'
);

code = code.replace(
  '<DesktopHoverMenu\n                    title="Presença"\n                    trigger={<div className="w-full"><NavTile to="/app/presence" icon={Clock3} label="Ponto" disabled={!can("app.presence")} /></div>}',
  '<DesktopHoverMenu\n                    title="Presença"\n                    disabled={!can("app.presence")}\n                    trigger={<div className="w-full"><NavTile to="/app/presence" icon={Clock3} label="Ponto" /></div>}'
);

code = code.replace(
  '<DesktopHoverMenu\n                    title="Financeiro"\n                    trigger={<div className="w-full"><NavTile to="/app/finance/ledger?tab=transactions" icon={Gauge} label="Cockpit" disabled={!can("app.finance.cockpit")} /></div>}',
  '<DesktopHoverMenu\n                    title="Financeiro"\n                    disabled={!can("app.finance.cockpit")}\n                    trigger={<div className="w-full"><NavTile to="/app/finance/ledger?tab=transactions" icon={Gauge} label="Cockpit" /></div>}'
);

fs.writeFileSync('src/components/AppShell.tsx', code);
console.log("Updated AppShell.tsx");
