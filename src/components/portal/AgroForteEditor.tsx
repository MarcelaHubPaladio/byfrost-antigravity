import { useState } from 'react';
import { ChevronDown, ChevronRight, Leaf, Image as ImageIcon, Package, Sprout, Cpu, AlignLeft, Phone, Plus, Trash2, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload } from './ImageUpload';
import type { AgroForteData, AgroForteProduct, SectionStyleOptions } from './agroforte-types';
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
// Section Style Editor
// ────────────────────────────────────────────
function SectionStyleEditor({ value = {}, onChange }: { value?: SectionStyleOptions, onChange: (v: SectionStyleOptions) => void }) {
  return (
    <div className="pt-3 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-100/50 dark:bg-slate-900/50 p-3 rounded-lg border border-dashed">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-4 h-4 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded flex items-center justify-center text-[10px] font-bold">#</span>
        <p className="text-[11px] uppercase font-bold text-slate-500">Aparência da Seção</p>
      </div>
      
      <Field label="ID / Âncora (para link do menu)">
        <Input
          value={value.id || ''}
          onChange={e => onChange({ ...value, id: e.target.value })}
          placeholder="ex: produtos"
          className="h-8 text-sm"
        />
      </Field>

      <div className="grid grid-cols-1 gap-2">
        <Field label="Cor de Fundo (CSS)">
          <Input
            value={value.backgroundColor || ''}
            onChange={e => onChange({ ...value, backgroundColor: e.target.value })}
            placeholder="#ffffff ou transparent"
            className="h-8 text-sm"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Espaço Interno Topo (Padding)">
          <Input
            value={value.paddingTop || ''}
            onChange={e => onChange({ ...value, paddingTop: e.target.value })}
            placeholder="ex: 60px"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Espaço Interno Base (Padding)">
          <Input
            value={value.paddingBottom || ''}
            onChange={e => onChange({ ...value, paddingBottom: e.target.value })}
            placeholder="ex: 60px"
            className="h-8 text-sm"
          />
        </Field>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <Field label="Espaço Externo Topo (Margin)">
          <Input
            value={value.marginTop || ''}
            onChange={e => onChange({ ...value, marginTop: e.target.value })}
            placeholder="ex: 20px"
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Espaço Externo Base (Margin)">
          <Input
            value={value.marginBottom || ''}
            onChange={e => onChange({ ...value, marginBottom: e.target.value })}
            placeholder="ex: 20px"
            className="h-8 text-sm"
          />
        </Field>
      </div>
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
  const safeNavLinks = data.brand.navLinks || [
    { label: 'Início', url: '#' },
    { label: 'Produtos', url: '#produtos' },
    { label: 'Serviços', url: '#servicos' },
    { label: 'Sobre Nós', url: '#sobre' },
    { label: 'Contato', url: '#contato' },
  ];

  const safeBanners = data.hero.banners || [{
    headline: (data.hero as any).headline || 'Cultivando',
    headlineHighlight: (data.hero as any).headlineHighlight || 'Confiança,',
    subtitle: (data.hero as any).subtitle || 'Soluções completas para o campo...',
    bgImage: (data.hero as any).bgImage || 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80',
    imagePosition: (data.hero as any).imagePosition || 'center',
    imageFit: (data.hero as any).imageFit || 'cover',
    overlayGradient: (data.hero as any).overlayGradient || 'linear-gradient(135deg, #0d2b0e 0%, #1a3a1f 40%, #2d5a1e 100%)',
    ctaText: (data.hero as any).ctaText || 'Conheça Nossas Soluções',
    ctaUrl: (data.hero as any).ctaUrl || '#',
    showBadge: (data.hero as any).showBadge !== false,
    badgeTitle: (data.hero as any).badgeTitle || 'QUALIDADE GARANTIDA',
    badgeText: (data.hero as any).badgeText || 'Produtos selecionados e parceiros de confiança...',
    badgeIcon: (data.hero as any).badgeIcon || 'Shield',
  }];

  const set = <K extends keyof AgroForteData>(key: K, value: AgroForteData[K]) =>
    onChange({ ...data, [key]: value });

  const setBrand = (patch: Partial<typeof data.brand>) =>
    set('brand', { navLinks: safeNavLinks, ...data.brand, ...patch });

  const setHero = (patch: Partial<typeof data.hero>) =>
    set('hero', { autoPlay: true, interval: 5, banners: safeBanners, ...data.hero, ...patch });

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
        <ImageUpload
          value={data.brand.logoImage || ''}
          onChange={url => setBrand({ logoImage: url })}
          label="Logo (Opcional, substitui o texto se preenchido)"
        />
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
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <Field label="Links do Menu">
            <div className="space-y-2 mt-2">
              {safeNavLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={link.label} onChange={e => {
                    const newLinks = [...safeNavLinks];
                    newLinks[i].label = e.target.value;
                    setBrand({ navLinks: newLinks });
                  }} placeholder="Rótulo" className="h-8 text-sm flex-1" />
                  <Input value={link.url} onChange={e => {
                    const newLinks = [...safeNavLinks];
                    newLinks[i].url = e.target.value;
                    setBrand({ navLinks: newLinks });
                  }} placeholder="URL ou #ancora" className="h-8 text-sm flex-1" />
                  <button onClick={() => {
                    const newLinks = [...safeNavLinks];
                    newLinks.splice(i, 1);
                    setBrand({ navLinks: newLinks });
                  }} className="h-8 w-8 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => {
                setBrand({ navLinks: [...safeNavLinks, { label: 'Novo Link', url: '#' }] });
              }} className="w-full flex items-center justify-center gap-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 py-2 rounded-md transition-colors border border-dashed border-green-200 dark:border-green-900/40">
                <Plus className="h-4 w-4" /> Adicionar Link
              </button>
            </div>
          </Field>
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex-1">
            <Field label="Botão do Menu (Texto)">
              <Input
                value={data.brand.navCta}
                onChange={e => setBrand({ navCta: e.target.value })}
                placeholder="Fale Conosco"
                className="h-8 text-sm"
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Botão do Menu (Link)">
              <Input
                value={data.brand.navCtaUrl}
                onChange={e => setBrand({ navCtaUrl: e.target.value })}
                placeholder="#contato"
                className="h-8 text-sm"
              />
            </Field>
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex-1">
            <Field label="Fundo do Menu (Topo)">
              <Input
                value={data.brand.navBackgroundTop || 'transparent'}
                onChange={e => setBrand({ navBackgroundTop: e.target.value })}
                placeholder="transparent"
                className="h-8 text-sm"
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Fundo do Menu (Rolagem)">
              <Input
                value={data.brand.navBackgroundScrolled || '#1a3a1f'}
                onChange={e => setBrand({ navBackgroundScrolled: e.target.value })}
                placeholder="#1a3a1f"
                className="h-8 text-sm"
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* HERO */}
      <Section title="Carrossel Hero (Banners)" icon={<ImageIcon className="h-4 w-4" />} defaultOpen>
        <div className="flex gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data.hero.autoPlay} onChange={e => setHero({ autoPlay: e.target.checked })} />
            Rotação automática
          </label>
          <Field label="Intervalo (segundos)">
            <Input type="number" value={data.hero.interval} onChange={e => setHero({ interval: Number(e.target.value) })} className="h-8 text-sm w-24" />
          </Field>
        </div>
        
        <div className="space-y-6">
          {safeBanners.map((banner, i) => (
            <div key={i} className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase font-bold text-slate-500">Banner {i + 1}</span>
                <div className="flex gap-1">
                  <button onClick={() => {
                    const newBanners = [...safeBanners];
                    newBanners.splice(i + 1, 0, { ...banner });
                    setHero({ banners: newBanners });
                  }} className="text-blue-500 hover:text-blue-600 p-1" title="Duplicar">
                    <Copy className="h-4 w-4" />
                  </button>
                  {safeBanners.length > 1 && (
                    <button onClick={() => {
                      const newBanners = [...safeBanners];
                      newBanners.splice(i, 1);
                      setHero({ banners: newBanners });
                    }} className="text-red-500 hover:text-red-600 p-1" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <ImageUpload
                value={banner.bgImage}
                onChange={url => {
                  const newBanners = [...safeBanners];
                  newBanners[i] = { ...banner, bgImage: url };
                  setHero({ banners: newBanners });
                }}
                label="Imagem de Fundo"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <Field label="Posição (object-position)">
                    <select
                      value={banner.imagePosition || 'center'}
                      onChange={e => {
                        const newBanners = [...safeBanners];
                        newBanners[i] = { ...banner, imagePosition: e.target.value };
                        setHero({ banners: newBanners });
                      }}
                      className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="center">Centro</option>
                      <option value="top">Topo</option>
                      <option value="bottom">Base</option>
                      <option value="left">Esquerda</option>
                      <option value="right">Direita</option>
                    </select>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="Preenchimento (object-fit)">
                    <select
                      value={banner.imageFit || 'cover'}
                      onChange={e => {
                        const newBanners = [...safeBanners];
                        newBanners[i] = { ...banner, imageFit: e.target.value };
                        setHero({ banners: newBanners });
                      }}
                      className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="cover">Cover (Cobre)</option>
                      <option value="contain">Contain (Inteira)</option>
                      <option value="fill">Fill (Estica)</option>
                    </select>
                  </Field>
                </div>
              </div>
              <Field label="Fundo / Gradiente (CSS)">
                <Input
                  value={banner.overlayGradient || 'linear-gradient(135deg, #0d2b0e 0%, #1a3a1f 40%, #2d5a1e 100%)'}
                  onChange={e => {
                    const newBanners = [...safeBanners];
                    newBanners[i] = { ...banner, overlayGradient: e.target.value };
                    setHero({ banners: newBanners });
                  }}
                  className="h-8 text-sm"
                  placeholder="linear-gradient(...) ou #cor"
                />
              </Field>
              <div className="flex gap-2">
                <Field label="Título">
                  <Input
                    value={banner.headline}
                    onChange={e => {
                      const newBanners = [...safeBanners];
                      newBanners[i] = { ...banner, headline: e.target.value };
                      setHero({ banners: newBanners });
                    }}
                    placeholder="Cultivando"
                    className="h-8 text-sm"
                  />
                </Field>
                <Field label="Destaque (verde)">
                  <Input
                    value={banner.headlineHighlight}
                    onChange={e => {
                      const newBanners = [...safeBanners];
                      newBanners[i] = { ...banner, headlineHighlight: e.target.value };
                      setHero({ banners: newBanners });
                    }}
                    placeholder="Confiança,"
                    className="h-8 text-sm text-green-700 font-bold"
                  />
                </Field>
              </div>
              <Field label="Subtítulo">
                <Textarea
                  value={banner.subtitle}
                  onChange={e => {
                    const newBanners = [...safeBanners];
                    newBanners[i] = { ...banner, subtitle: e.target.value };
                    setHero({ banners: newBanners });
                  }}
                  placeholder="Descreva..."
                  className="text-sm resize-none"
                  rows={2}
                />
              </Field>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Field label="Texto CTA">
                    <Input
                      value={banner.ctaText}
                      onChange={e => {
                        const newBanners = [...safeBanners];
                        newBanners[i] = { ...banner, ctaText: e.target.value };
                        setHero({ banners: newBanners });
                      }}
                      className="h-8 text-sm"
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="Link CTA">
                    <Input
                      value={banner.ctaUrl}
                      onChange={e => {
                        const newBanners = [...safeBanners];
                        newBanners[i] = { ...banner, ctaUrl: e.target.value };
                        setHero({ banners: newBanners });
                      }}
                      className="h-8 text-sm"
                    />
                  </Field>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Badge de Qualidade</p>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={banner.showBadge !== false} onChange={e => {
                      const newBanners = [...safeBanners];
                      newBanners[i] = { ...banner, showBadge: e.target.checked };
                      setHero({ banners: newBanners });
                    }} /> Mostrar badge
                  </label>
                </div>
                {banner.showBadge !== false && (
                  <div className="space-y-2">
                    <Field label="Ícone">
                      <select
                        value={banner.badgeIcon || 'Shield'}
                        onChange={e => {
                          const newBanners = [...safeBanners];
                          newBanners[i] = { ...banner, badgeIcon: e.target.value };
                          setHero({ banners: newBanners });
                        }}
                        className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      >
                        <option value="Shield">Escudo (Shield)</option>
                        <option value="CheckCircle">Check (CheckCircle)</option>
                        <option value="Leaf">Folha (Leaf)</option>
                        <option value="Star">Estrela (Star)</option>
                        <option value="Heart">Coração (Heart)</option>
                        <option value="Award">Prêmio (Award)</option>
                      </select>
                    </Field>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Field label="Título do Badge">
                          <Input
                            value={banner.badgeTitle}
                            onChange={e => {
                              const newBanners = [...safeBanners];
                              newBanners[i] = { ...banner, badgeTitle: e.target.value };
                              setHero({ banners: newBanners });
                            }}
                            className="h-8 text-sm"
                          />
                        </Field>
                      </div>
                      <div className="flex-[2]">
                        <Field label="Texto do Badge">
                          <Input
                            value={banner.badgeText}
                            onChange={e => {
                              const newBanners = [...safeBanners];
                              newBanners[i] = { ...banner, badgeText: e.target.value };
                              setHero({ banners: newBanners });
                            }}
                            className="h-8 text-sm"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => {
            const newBanners = [...safeBanners, safeBanners[0]]; // copy first banner as template
            setHero({ banners: newBanners });
          }} className="w-full flex items-center justify-center gap-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 py-2 rounded-md transition-colors border border-dashed border-green-200 dark:border-green-900/40">
            <Plus className="h-4 w-4" /> Adicionar Banner
          </button>
        </div>
        <SectionStyleEditor
          value={data.hero.styles}
          onChange={styles => setHero({ styles })}
        />
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
        <SectionStyleEditor
          value={data.featuredProductsStyles}
          onChange={styles => set('featuredProductsStyles', styles)}
        />
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
        <SectionStyleEditor
          value={data.catalogs.insumos.styles}
          onChange={styles => set('catalogs', { ...data.catalogs, insumos: { ...data.catalogs.insumos, styles } })}
        />
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
        <SectionStyleEditor
          value={data.catalogs.tecnologia.styles}
          onChange={styles => set('catalogs', { ...data.catalogs, tecnologia: { ...data.catalogs.tecnologia, styles } })}
        />
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
        <SectionStyleEditor
          value={data.catalogs.plantio.styles}
          onChange={styles => set('catalogs', { ...data.catalogs, plantio: { ...data.catalogs.plantio, styles } })}
        />
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
