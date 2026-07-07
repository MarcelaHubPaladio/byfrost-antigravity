import { useState } from 'react';
import { ChevronDown, ChevronRight, Leaf, Image as ImageIcon, Package, Sprout, Cpu, AlignLeft, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload } from './ImageUpload';
import type { AgroForteData, AgroForteProduct } from './agroforte-types';
import { cn } from '@/lib/utils';

interface AgroForteEditorProps {
  data: AgroForteData;
  onChange: (data: AgroForteData) => void;
}

// ────────────────────────────────────────────
// Accordion section wrapper
// ────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-700 dark:text-green-400 flex-shrink-0">
          {icon}
        </span>
        <span className="font-semibold text-sm flex-1">{title}</span>
        {open
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />
        }
      </button>
      {open && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 space-y-4 border-t border-slate-100 dark:border-slate-800">
          {children}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Labeled field wrapper
// ────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────
// Product card editor (inline)
// ────────────────────────────────────────────
function ProductEditor({ product, onChange, compact = false }: {
  product: AgroForteProduct;
  onChange: (p: AgroForteProduct) => void;
  compact?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-3">
      <ImageUpload
        value={product.image}
        onChange={url => onChange({ ...product, image: url })}
        label="Imagem"
        className={compact ? '[&_.aspect-video]:aspect-[3/2]' : ''}
      />
      <Field label="Nome">
        <Input
          value={product.name}
          onChange={e => onChange({ ...product, name: e.target.value })}
          placeholder="Nome do produto"
          className="h-8 text-sm"
        />
      </Field>
      <div className="flex gap-2">
        <Field label="Preço">
          <Input
            value={product.price}
            onChange={e => onChange({ ...product, price: e.target.value })}
            placeholder="R$ 0,00"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Unidade">
          <Input
            value={product.unit || ''}
            onChange={e => onChange({ ...product, unit: e.target.value })}
            placeholder="/saca"
            className="h-8 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Main Editor component
// ────────────────────────────────────────────
export function AgroForteEditor({ data, onChange }: AgroForteEditorProps) {
  const set = <K extends keyof AgroForteData>(key: K, value: AgroForteData[K]) =>
    onChange({ ...data, [key]: value });

  const setBrand = (patch: Partial<typeof data.brand>) =>
    set('brand', { ...data.brand, ...patch });

  const setHero = (patch: Partial<typeof data.hero>) =>
    set('hero', { ...data.hero, ...patch });

  const setFooter = (patch: Partial<typeof data.footer>) =>
    set('footer', { ...data.footer, ...patch });

  const setFeatured = (i: number, p: AgroForteProduct) => {
    const updated = [...data.featuredProducts];
    updated[i] = p;
    set('featuredProducts', updated);
  };

  const setCatalogProduct = (
    catalog: keyof typeof data.catalogs,
    i: number,
    p: AgroForteProduct
  ) => {
    const updated = [...data.catalogs[catalog].products];
    updated[i] = p;
    set('catalogs', {
      ...data.catalogs,
      [catalog]: { ...data.catalogs[catalog], products: updated },
    });
  };

  const setCatalogDesc = (catalog: keyof typeof data.catalogs, description: string) => {
    set('catalogs', {
      ...data.catalogs,
      [catalog]: { ...data.catalogs[catalog], description },
    });
  };

  return (
    <div className="space-y-3">
      {/* Header banner */}
      <div className="flex items-center gap-2 px-1 mb-4">
        <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center">
          <Leaf className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none">AgroForte</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Editor visual</p>
        </div>
      </div>

      {/* IDENTIDADE */}
      <Section title="Identidade & Navegação" icon={<Leaf className="h-4 w-4" />} defaultOpen>
        <Field label="Nome do Logo">
          <Input
            value={data.brand.name}
            onChange={e => setBrand({ name: e.target.value })}
            placeholder="AgroFORTE"
            className="h-8 text-sm font-bold"
          />
        </Field>
        <Field label="Tagline do Logo">
          <Input
            value={data.brand.tagline}
            onChange={e => setBrand({ tagline: e.target.value })}
            placeholder="Soluções Agrícolas"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Botão do Menu">
          <Input
            value={data.brand.navCta}
            onChange={e => setBrand({ navCta: e.target.value })}
            placeholder="Fale Conosco"
            className="h-8 text-sm"
          />
        </Field>
      </Section>

      {/* HERO */}
      <Section title="Hero (Destaque Principal)" icon={<ImageIcon className="h-4 w-4" />} defaultOpen>
        <ImageUpload
          value={data.hero.bgImage}
          onChange={url => setHero({ bgImage: url })}
          label="Imagem de Fundo"
        />
        <div className="flex gap-2">
          <Field label="Título">
            <Input
              value={data.hero.headline}
              onChange={e => setHero({ headline: e.target.value })}
              placeholder="Cultivando"
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Palavra em destaque (verde)">
            <Input
              value={data.hero.headlineHighlight}
              onChange={e => setHero({ headlineHighlight: e.target.value })}
              placeholder="Confiança,"
              className="h-8 text-sm text-green-700 font-bold"
            />
          </Field>
        </div>
        <Field label="Subtítulo">
          <Textarea
            value={data.hero.subtitle}
            onChange={e => setHero({ subtitle: e.target.value })}
            placeholder="Descreva o que a empresa oferece..."
            className="text-sm resize-none"
            rows={2}
          />
        </Field>
        <Field label="Texto do Botão CTA">
          <Input
            value={data.hero.ctaText}
            onChange={e => setHero({ ctaText: e.target.value })}
            placeholder="Conheça Nossas Soluções"
            className="h-8 text-sm"
          />
        </Field>
        <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <p className="text-[10px] uppercase font-bold text-slate-400">Badge de Qualidade</p>
          <Field label="Título do Badge">
            <Input
              value={data.hero.badgeTitle}
              onChange={e => setHero({ badgeTitle: e.target.value })}
              placeholder="QUALIDADE GARANTIDA"
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Texto do Badge">
            <Input
              value={data.hero.badgeText}
              onChange={e => setHero({ badgeText: e.target.value })}
              placeholder="Produtos selecionados..."
              className="h-8 text-sm"
            />
          </Field>
        </div>
      </Section>

      {/* PRODUTOS EM DESTAQUE */}
      <Section title="Produtos em Destaque (6)" icon={<Package className="h-4 w-4" />}>
        <p className="text-xs text-slate-500 -mt-1">Estes 6 produtos aparecem na grade principal.</p>
        <div className="space-y-3">
          {data.featuredProducts.map((p, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Produto {i + 1}</p>
              <ProductEditor product={p} onChange={np => setFeatured(i, np)} />
            </div>
          ))}
        </div>
      </Section>

      {/* CATALOGO INSUMOS */}
      <Section title="Catálogo — Insumos Agrícolas" icon={<Sprout className="h-4 w-4" />}>
        <Field label="Descrição da seção">
          <Textarea
            value={data.catalogs.insumos.description}
            onChange={e => setCatalogDesc('insumos', e.target.value)}
            className="text-sm resize-none"
            rows={2}
          />
        </Field>
        <div className="space-y-3">
          {data.catalogs.insumos.products.map((p, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Produto {i + 1}</p>
              <ProductEditor product={p} onChange={np => setCatalogProduct('insumos', i, np)} compact />
            </div>
          ))}
        </div>
      </Section>

      {/* CATALOGO TECNOLOGIA */}
      <Section title="Catálogo — Tecnologia de Aplicação" icon={<Cpu className="h-4 w-4" />}>
        <Field label="Descrição da seção">
          <Textarea
            value={data.catalogs.tecnologia.description}
            onChange={e => setCatalogDesc('tecnologia', e.target.value)}
            className="text-sm resize-none"
            rows={2}
          />
        </Field>
        <div className="space-y-3">
          {data.catalogs.tecnologia.products.map((p, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Produto {i + 1}</p>
              <ProductEditor product={p} onChange={np => setCatalogProduct('tecnologia', i, np)} compact />
            </div>
          ))}
        </div>
      </Section>

      {/* CATALOGO PLANTIO */}
      <Section title="Catálogo — Plantio e Solo" icon={<AlignLeft className="h-4 w-4" />}>
        <Field label="Descrição da seção">
          <Textarea
            value={data.catalogs.plantio.description}
            onChange={e => setCatalogDesc('plantio', e.target.value)}
            className="text-sm resize-none"
            rows={2}
          />
        </Field>
        <div className="space-y-3">
          {data.catalogs.plantio.products.map((p, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Produto {i + 1}</p>
              <ProductEditor product={p} onChange={np => setCatalogProduct('plantio', i, np)} compact />
            </div>
          ))}
        </div>
      </Section>

      {/* RODAPÉ */}
      <Section title="Contato & Rodapé" icon={<Phone className="h-4 w-4" />}>
        <Field label="Telefone / WhatsApp">
          <Input
            value={data.footer.phone}
            onChange={e => setFooter({ phone: e.target.value })}
            placeholder="(00) 00000-0000"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Email">
          <Input
            value={data.footer.email}
            onChange={e => setFooter({ email: e.target.value })}
            placeholder="contato@empresa.com.br"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Endereço">
          <Input
            value={data.footer.address}
            onChange={e => setFooter({ address: e.target.value })}
            placeholder="Cidade - Estado"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Texto de Copyright">
          <Input
            value={data.footer.copyright}
            onChange={e => setFooter({ copyright: e.target.value })}
            placeholder="© 2025 Empresa. Todos os direitos reservados."
            className="h-8 text-sm"
          />
        </Field>
      </Section>
    </div>
  );
}
