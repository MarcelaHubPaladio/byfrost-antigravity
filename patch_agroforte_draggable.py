import re

with open("src/components/portal/AgroForteEditor.tsx", "r") as f:
    content = f.read()

# 1. Add imports
imports = """import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, ChevronLeft, Leaf, Image as ImageIcon, Package, Sprout, Cpu, AlignLeft, Phone, Plus, Trash2, Copy, Info, Grid, GripVertical } from 'lucide-react';"""
content = content.replace("import { useState } from 'react';\nimport { ChevronDown, ChevronRight, ChevronLeft, Leaf, Image as ImageIcon, Package, Sprout, Cpu, AlignLeft, Phone, Plus, Trash2, Copy, Info, Grid } from 'lucide-react';", imports)


# 2. Modify Section signature
old_section_sig = """function Section({ title, icon, children, defaultOpen = false, hidden = false, forceOpen = false, onBack }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
  forceOpen?: boolean;
  onBack?: () => void;
}) {"""
new_section_sig = """function Section({ id, title, icon, children, defaultOpen = false, hidden = false, forceOpen = false, onBack }: {
  id?: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
  forceOpen?: boolean;
  onBack?: () => void;
}) {"""
content = content.replace(old_section_sig, new_section_sig)


# 3. Modify Section component body
old_section_body = """  const [open, setOpen] = useState(defaultOpen);
  if (hidden) return null;
  
  const isOpen = forceOpen || open;
  
  return (
    <div className={cn(forceOpen ? "" : "border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden")}>
      <div
        className={cn("w-full flex items-center gap-3 bg-white dark:bg-slate-900 text-left", forceOpen ? "pb-4" : "p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer")}
        onClick={() => !forceOpen && setOpen(!open)}
      >
        {forceOpen && onBack && (
          <button 
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors mr-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-700 dark:text-green-400 flex-shrink-0">
          {icon}
        </span>
        <span className={cn("font-semibold flex-1", forceOpen ? "text-lg" : "text-sm")}>{title}</span>
        {!forceOpen && (
          isOpen
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </div>"""

new_section_body = """  const [open, setOpen] = useState(defaultOpen);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id || title,
    data: { type: 'new-block', blockType: id, isSidebarItem: true },
    disabled: !id || forceOpen,
  });

  if (hidden) return null;
  
  const isOpen = forceOpen || open;
  
  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 9999 : 1,
  } : undefined;
  
  return (
    <div ref={setNodeRef} style={style} className={cn(forceOpen ? "" : "border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden", isDragging && "shadow-xl border-indigo-500")}>
      <div
        className={cn("w-full flex items-center gap-3 bg-white dark:bg-slate-900 text-left relative", forceOpen ? "pb-4" : "p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer")}
        onClick={() => !forceOpen && setOpen(!open)}
      >
        {forceOpen && onBack && (
          <button 
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors mr-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-700 dark:text-green-400 flex-shrink-0">
          {icon}
        </span>
        <span className={cn("font-semibold flex-1", forceOpen ? "text-lg" : "text-sm")}>{title}</span>
        
        {!forceOpen && id && (
            <div 
                {...attributes} 
                {...listeners} 
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
                title="Arrastar para o palco"
            >
                <GripVertical className="h-4 w-4" />
            </div>
        )}
        
        {!forceOpen && (
          isOpen
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </div>"""

content = content.replace(old_section_body, new_section_body)


# 4. Inject id into Section usages
content = content.replace('<Section \n        title="Identidade & Navegação"', '<Section \n        id="header"\n        title="Identidade & Navegação"')
content = content.replace('      <Section \n        title="Identidade & Navegação"', '      <Section \n        id="header"\n        title="Identidade & Navegação"')

content = content.replace('<Section \n        title="Carrossel Hero (Banners)"', '<Section \n        id="hero"\n        title="Carrossel Hero (Banners)"')
content = content.replace('      <Section \n        title="Carrossel Hero (Banners)"', '      <Section \n        id="hero"\n        title="Carrossel Hero (Banners)"')

content = content.replace('<Section \n        title="Sobre Nós (Por que escolher AgroForte?)"', '<Section \n        id="about"\n        title="Sobre Nós (Por que escolher AgroForte?)"')
content = content.replace('      <Section \n        title="Sobre Nós (Por que escolher AgroForte?)"', '      <Section \n        id="about"\n        title="Sobre Nós (Por que escolher AgroForte?)"')

content = content.replace('<Section \n        title="Produtos em Destaque (6)"', '<Section \n        id="featured_products"\n        title="Produtos em Destaque (6)"')
content = content.replace('      <Section \n        title="Produtos em Destaque (6)"', '      <Section \n        id="featured_products"\n        title="Produtos em Destaque (6)"')

content = content.replace('<Section \n        title="Categorias (Nossas Soluções)"', '<Section \n        id="catalogs_categories"\n        title="Categorias (Nossas Soluções)"')
content = content.replace('      <Section \n        title="Categorias (Nossas Soluções)"', '      <Section \n        id="catalogs_categories"\n        title="Categorias (Nossas Soluções)"')

content = content.replace('<Section \n        title="Catálogo — Insumos Agrícolas"', '<Section \n        id="catalogs"\n        title="Catálogo — Insumos Agrícolas"')
content = content.replace('      <Section \n        title="Catálogo — Insumos Agrícolas"', '      <Section \n        id="catalogs"\n        title="Catálogo — Insumos Agrícolas"')

content = content.replace('<Section \n        title="Catálogo — Sementes"', '<Section \n        id="catalogs_lists"\n        title="Catálogo — Sementes"')
content = content.replace('      <Section \n        title="Catálogo — Sementes"', '      <Section \n        id="catalogs_lists"\n        title="Catálogo — Sementes"')

content = content.replace('<Section \n        title="Call to Action"', '<Section \n        id="cta"\n        title="Call to Action"')
content = content.replace('      <Section \n        title="Call to Action"', '      <Section \n        id="cta"\n        title="Call to Action"')

content = content.replace('<Section \n        title="Rodapé & Contato"', '<Section \n        id="footer"\n        title="Rodapé & Contato"')
content = content.replace('      <Section \n        title="Rodapé & Contato"', '      <Section \n        id="footer"\n        title="Rodapé & Contato"')

with open("src/components/portal/AgroForteEditor.tsx", "w") as f:
    f.write(content)

