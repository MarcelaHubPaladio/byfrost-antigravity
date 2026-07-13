import type { AgroForteData } from './agroforte-types';
import { useState, useEffect } from 'react';

interface AgroForteRendererProps {
  data: AgroForteData;
}

const AGROFORTE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  .afr-root,[class*="afr-"]{box-sizing:border-box}
  .afr-root{font-family:Inter,system-ui,sans-serif;color:#1a1a1a;margin:0;padding:0}
  .afr-nav{padding:0 5%;display:flex;align-items:center;justify-content:space-between;height:64px;position:fixed;top:0;left:0;right:0;z-index:50;transition:background-color 0.3s ease}
  .afr-logo{display:flex;align-items:center;gap:8px;text-decoration:none}
  .afr-logo-icon{width:36px;height:36px;background:#4caf50;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .afr-logo-icon svg{width:22px;height:22px;fill:#fff}
  .afr-logo-name{color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1}
  .afr-logo-name em{color:#8bc34a;font-style:normal}
  .afr-logo-tag{color:#8bc34a;font-size:10px;font-weight:600;letter-spacing:1px;display:block;margin-top:-2px}
  .afr-nav-links{display:flex;gap:28px;list-style:none;margin:0;padding:0}
  .afr-nav-links a{color:rgba(255,255,255,.85);text-decoration:none;font-size:14px;font-weight:500;transition:color .2s}
  .afr-nav-links a:hover{color:#8bc34a}
  .afr-nav-cta{background:#4caf50;color:#fff!important;border:none;padding:10px 22px;border-radius:24px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .2s;font-family:inherit;text-decoration:none}
  .afr-nav-cta:hover{background:#43a047}
  .afr-hero{background:linear-gradient(135deg,#0d2b0e 0%,#1a3a1f 40%,#2d5a1e 100%);min-height:520px;position:relative;overflow:hidden}
  .afr-hero-slide{position:absolute;inset:0;opacity:0;transition:opacity 0.8s ease;display:flex;align-items:center;padding:60px 5%;pointer-events:none}
  .afr-hero-slide.active{opacity:1;z-index:1;pointer-events:auto}
  .afr-hero-bg{position:absolute;right:0;top:0;width:55%;height:100%;object-fit:cover;opacity:.35}
  .afr-hero-content{position:relative;z-index:2;max-width:600px}
  .afr-hero-content h1{font-size:52px;font-weight:900;color:#fff;line-height:1.1;margin:0 0 16px;font-family:inherit}
  .afr-hero-content h1 em{color:#8bc34a;font-style:normal}
  .afr-hero-content p{color:rgba(255,255,255,.75);font-size:16px;line-height:1.6;margin:0 0 32px;max-width:460px}
  .afr-hero-cta{display:inline-flex;align-items:center;gap:8px;background:#4caf50;color:#fff;padding:14px 28px;border-radius:32px;font-size:15px;font-weight:700;text-decoration:none;transition:background .2s}
  .afr-hero-cta:hover{background:#43a047}
  .afr-hero-badge{position:absolute;bottom:40px;right:5%;background:rgba(255,255,255,.95);border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:12px;z-index:2;box-shadow:0 8px 32px rgba(0,0,0,.2);max-width:320px}
  .afr-hero-badge-icon{width:40px;height:40px;background:#e8f5e9;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .afr-hero-badge-icon svg{width:22px;height:22px;stroke:#2e7d32;fill:none;stroke-width:2}
  .afr-hero-badge strong{display:block;font-size:13px;font-weight:800;color:#1a3a1f}
  .afr-hero-badge span{font-size:11px;color:#555;line-height:1.4;display:block;margin-top:2px}
  .afr-section-solutions{padding:60px 5%;background:#f9fafb}
  .afr-section-label{text-align:center;font-size:13px;font-weight:700;letter-spacing:2px;color:#666;text-transform:uppercase;margin:0 0 36px}
  .afr-categories{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .afr-cat-card{border-radius:20px;overflow:hidden;position:relative;min-height:280px;cursor:pointer}
  .afr-cat-card img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
  .afr-cat-overlay{position:absolute;inset:0}
  .afr-cat-overlay.green{background:linear-gradient(to top,rgba(27,67,27,.9),rgba(27,67,27,.5) 60%,transparent)}
  .afr-cat-overlay.purple{background:linear-gradient(to top,rgba(49,27,76,.9),rgba(49,27,76,.5) 60%,transparent)}
  .afr-cat-overlay.brown{background:linear-gradient(to top,rgba(62,39,21,.9),rgba(62,39,21,.5) 60%,transparent)}
  .afr-cat-content{position:absolute;bottom:0;left:0;right:0;padding:24px}
  .afr-cat-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
  .afr-cat-icon svg{width:26px;height:26px;fill:#fff}
  .afr-cat-content h3{color:#fff;font-size:18px;font-weight:800;margin:0 0 6px;text-transform:uppercase;letter-spacing:.5px}
  .afr-cat-content p{color:rgba(255,255,255,.75);font-size:12px;line-height:1.5;margin:0 0 16px}
  .afr-cat-btn{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.4)}
  .afr-cat-btn svg{width:16px;height:16px;stroke:#fff;fill:none;stroke-width:2.5}
  .afr-section-products{padding:60px 5%;background:#fff}
  .afr-products-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px}
  .afr-products-label{font-size:13px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px}
  .afr-products-title{font-size:32px;font-weight:900;color:#1a1a1a;margin:0}
  .afr-products-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;margin-bottom:32px}
  .afr-product-card{border:1px solid #e8f0e9;border-radius:16px;overflow:hidden;background:#fff}
  .afr-product-card img{width:100%;height:120px;object-fit:cover}
  .afr-product-card-info{padding:12px}
  .afr-product-card-info h4{font-size:12px;font-weight:700;color:#1a1a1a;margin:0 0 4px;line-height:1.3}
  .afr-product-price{font-size:13px;font-weight:800;color:#2e7d32}
  .afr-product-unit{font-size:10px;color:#888;font-weight:500}
  .afr-product-add{width:100%;background:#2e7d32;color:#fff;border:none;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
  .afr-view-all{display:flex;align-items:center;justify-content:center;margin:0 auto;background:#1a3a1f;color:#fff;border:none;padding:14px 32px;border-radius:32px;font-size:14px;font-weight:700;cursor:pointer;gap:8px;font-family:inherit}
  .afr-catalog-row{display:flex;align-items:stretch;min-height:200px}
  .afr-catalog-row.insumos{background:#2d5a1e}
  .afr-catalog-row.tecnologia{background:#311b4c}
  .afr-catalog-row.plantio{background:#3e2715}
  .afr-catalog-info{width:280px;flex-shrink:0;padding:36px 32px;display:flex;flex-direction:column;justify-content:center}
  .afr-catalog-info-icon{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;margin-bottom:16px}
  .afr-catalog-info-icon svg{width:28px;height:28px;fill:#fff}
  .afr-catalog-info h3{color:#fff;font-size:22px;font-weight:900;margin:0 0 10px;text-transform:uppercase;letter-spacing:.5px}
  .afr-catalog-info p{color:rgba(255,255,255,.7);font-size:13px;line-height:1.6;margin:0 0 20px}
  .afr-catalog-info a{color:#fff;font-size:13px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:6px;opacity:.9}
  .afr-catalog-products{flex:1;display:flex;align-items:center;gap:16px;padding:24px 16px;overflow-x:auto}
  .afr-catalog-product{flex-shrink:0;width:160px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.2)}
  .afr-catalog-product img{width:100%;height:110px;object-fit:cover}
  .afr-catalog-product-info{padding:10px 12px 12px}
  .afr-catalog-product-info h4{font-size:12px;font-weight:700;color:#1a1a1a;margin:0 0 4px;line-height:1.3}
  .afr-catalog-product-info span{font-size:12px;font-weight:700;color:#2e7d32}
  .afr-section-why{background:#f0f4f0;padding:60px 5%}
  .afr-why-label{font-size:13px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:2px;text-align:center;margin:0 0 12px}
  .afr-why-title{font-size:34px;font-weight:900;color:#1a3a1f;text-align:center;margin:0 0 48px;line-height:1.2}
  .afr-why-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
  .afr-why-item{background:#fff;border-radius:20px;padding:28px 24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.05)}
  .afr-why-icon{width:56px;height:56px;border-radius:16px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .afr-why-icon svg{width:28px;height:28px;stroke:#2e7d32;fill:none;stroke-width:1.8}
  .afr-why-item h4{font-size:15px;font-weight:800;color:#1a3a1f;margin:0 0 8px}
  .afr-why-item p{font-size:13px;color:#666;line-height:1.6;margin:0}
  .afr-section-cta{background:#1a3a1f;padding:60px 5%}
  .afr-cta-inner{display:flex;align-items:center;justify-content:space-between;gap:48px;flex-wrap:wrap}
  .afr-cta-title{color:#fff;font-size:26px;font-weight:800;margin:0;line-height:1.3}
  .afr-cta-title em{color:#8bc34a;font-style:normal}
  .afr-cta-form{display:flex;gap:12px;flex:1;max-width:600px;flex-wrap:wrap}
  .afr-cta-input{flex:1;min-width:140px;padding:14px 20px;border-radius:12px;border:none;background:rgba(255,255,255,.1);color:#fff;font-size:14px;outline:none;font-family:inherit}
  .afr-cta-input::placeholder{color:rgba(255,255,255,.5)}
  .afr-cta-btn{background:#4caf50;color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;font-family:inherit}
  .afr-footer{background:#0d1f0f;padding:48px 5% 24px;font-family:Inter,system-ui,sans-serif}
  .afr-footer-top{display:grid;grid-template-columns:1.5fr 1fr 1.2fr 1fr;gap:40px;margin-bottom:40px}
  .afr-footer-brand{font-size:20px;font-weight:900;color:#fff;margin-bottom:8px}
  .afr-footer-brand em{color:#8bc34a;font-style:normal}
  .afr-footer-tag{font-size:12px;color:rgba(255,255,255,.5);margin-bottom:16px}
  .afr-footer-social{display:flex;gap:8px}
  .afr-footer-social a{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center}
  .afr-footer-social svg{width:14px;height:14px;fill:rgba(255,255,255,.7)}
  .afr-footer-col h4{color:rgba(255,255,255,.5);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 16px}
  .afr-footer-col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .afr-footer-col ul a{color:rgba(255,255,255,.75);text-decoration:none;font-size:13px}
  .afr-contact-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:13px;color:rgba(255,255,255,.75)}
  .afr-contact-row svg{width:14px;height:14px;stroke:rgba(255,255,255,.5);fill:none;stroke-width:2;flex-shrink:0}
  .afr-footer-bottom{border-top:1px solid rgba(255,255,255,.08);padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
  .afr-footer-bottom p{font-size:11px;color:rgba(255,255,255,.35);margin:0}
  @media(max-width:900px){
    .afr-categories{grid-template-columns:1fr}
    .afr-products-grid{grid-template-columns:repeat(2,1fr)}
    .afr-catalog-row{flex-direction:column}
    .afr-catalog-info{width:100%}
    .afr-why-grid{grid-template-columns:repeat(2,1fr)}
    .afr-footer-top{grid-template-columns:1fr 1fr}
    .afr-cta-inner{flex-direction:column}
    .afr-nav-links{display:none}
    .afr-hero-badge{display:none}
  }
`;

export function AgroForteRenderer({ data }: AgroForteRendererProps) {
  const { brand, hero, featuredProducts, catalogs, footer } = data;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  const safeNavLinks = brand.navLinks || [
    { label: 'Início', url: '#' },
    { label: 'Produtos', url: '#produtos' },
    { label: 'Serviços', url: '#servicos' },
    { label: 'Sobre Nós', url: '#sobre' },
    { label: 'Contato', url: '#contato' },
  ];

  const safeBanners = hero.banners || [{
    headline: (hero as any).headline || 'Cultivando',
    headlineHighlight: (hero as any).headlineHighlight || 'Confiança,',
    subtitle: (hero as any).subtitle || 'Soluções completas para o campo, com qualidade, tecnologia e atendimento que faz a diferença.',
    bgImage: (hero as any).bgImage || 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80',
    ctaText: (hero as any).ctaText || 'Conheça Nossas Soluções',
    ctaUrl: (hero as any).ctaUrl || '#',
    badgeTitle: (hero as any).badgeTitle || 'QUALIDADE GARANTIDA',
    badgeText: (hero as any).badgeText || 'Produtos selecionados e parceiros de confiança para o melhor resultado no campo.',
  }];
  
  useEffect(() => {
    if (!hero.autoPlay || safeBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide(c => (c + 1) % safeBanners.length);
    }, Math.max(1, hero.interval || 5) * 1000);
    return () => clearInterval(timer);
  }, [hero.autoPlay, hero.interval, safeBanners.length]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Parse brand name: last uppercase word gets green color
  const nameParts = brand.name.split(/(?=[A-Z][^A-Z]+$)/);
  const brandFirst = nameParts.length > 1 ? nameParts[0] : brand.name.slice(0, 4);
  const brandSecond = nameParts.length > 1 ? nameParts[1] : brand.name.slice(4);

  return (
    <div className="afr-root">
      <style dangerouslySetInnerHTML={{ __html: AGROFORTE_CSS }} />

      {/* NAV */}
      <nav className="afr-nav" style={{ backgroundColor: isScrolled ? (brand.navBackgroundScrolled || '#1a3a1f') : (brand.navBackgroundTop || 'transparent') }}>
        <div className="afr-logo">
          {brand.logoImage ? (
            <img src={brand.logoImage} alt={brand.name} style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
          ) : (
            <>
              <div className="afr-logo-icon">
                <svg viewBox="0 0 24 24"><path d="M12 2C9 2 6 4 5 7C4 10 5 13 7 15C9 17 11 17 11 20H13C13 17 15 17 17 15C19 13 20 10 19 7C18 4 15 2 12 2Z"/><rect x="10" y="20" width="4" height="3" rx="1"/></svg>
              </div>
              <div>
                <span className="afr-logo-name">{brandFirst}<em>{brandSecond}</em></span>
                <span className="afr-logo-tag">{brand.tagline}</span>
              </div>
            </>
          )}
        </div>
        <ul className="afr-nav-links">
          {safeNavLinks.map((link, idx) => (
            <li key={idx}><a href={link.url}>{link.label}</a></li>
          ))}
        </ul>
        <a href={brand.navCtaUrl || '#contato'} className="afr-nav-cta">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.47 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 013.38 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.91 8.96a16 16 0 006.07 6.07l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          {brand.navCta}
        </a>
      </nav>

      {/* HERO */}
      <section className="afr-hero">
        {safeBanners.map((banner, i) => (
          <div key={i} className={`afr-hero-slide ${i === currentSlide ? 'active' : ''}`}>
            <img className="afr-hero-bg" src={banner.bgImage} alt="" />
            <div className="afr-hero-content">
              <h1>
                {banner.headline} <em>{banner.headlineHighlight}</em><br/>
                Colhendo<br/>Soluções.
              </h1>
              <p>{banner.subtitle}</p>
              <a href={banner.ctaUrl} className="afr-hero-cta">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                {banner.ctaText}
              </a>
            </div>
            <div className="afr-hero-badge">
              <div className="afr-hero-badge-icon">
                <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <strong>{banner.badgeTitle}</strong>
                <span>{banner.badgeText}</span>
              </div>
            </div>
          </div>
        ))}
        {safeBanners.length > 1 && (
          <div style={{ position: 'absolute', bottom: '20px', left: '5%', zIndex: 3, display: 'flex', gap: '8px' }}>
            {safeBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                style={{ width: '8px', height: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: i === currentSlide ? '#4caf50' : 'rgba(255,255,255,0.3)' }}
              />
            ))}
          </div>
        )}
      </section>

      {/* CATEGORIAS */}
      <section className="afr-section-solutions">
        <p className="afr-section-label">NOSSAS SOLUÇÕES PARA CADA ETAPA DO CAMPO</p>
        <div className="afr-categories">
          {[
            { title: 'INSUMOS AGRÍCOLAS', desc: 'Fertilizantes, sementes e defensivos de alta qualidade para máxima produtividade das lavouras.', img: 'https://images.unsplash.com/photo-1585664811154-4c86e2e5f86d?w=600&q=80', color: 'green', icon: <svg viewBox="0 0 24 24"><path d="M12 2C9 2 6 4 5 7C4 10 5 13 7 15C9 17 11 17 11 20H13C13 17 15 17 17 15C19 13 20 10 19 7C18 4 15 2 12 2Z"/></svg> },
            { title: 'TECNOLOGIA DE APLICAÇÃO', desc: 'Equipamentos e soluções que garantem eficiência e precisão na aplicação.', img: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=600&q=80', color: 'purple', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
            { title: 'PLANTIO E PREPARO DE SOLO', desc: 'Máquinas e implementos para cultivo, plantio e manejo com mais desempenho.', img: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&q=80', color: 'brown', icon: <svg viewBox="0 0 24 24"><path d="M3 9L12 2L21 9V20A2 2 0 0119 22H5A2 2 0 013 20V9Z"/></svg> },
          ].map(cat => (
            <div className="afr-cat-card" key={cat.title}>
              <img src={cat.img} alt={cat.title} />
              <div className={`afr-cat-overlay ${cat.color}`} />
              <div className="afr-cat-content">
                <div className="afr-cat-icon" style={{ background: cat.color === 'green' ? 'rgba(76,175,80,.3)' : cat.color === 'purple' ? 'rgba(156,39,176,.3)' : 'rgba(121,85,72,.3)' }}>
                  {cat.icon}
                </div>
                <h3>{cat.title}</h3>
                <p>{cat.desc}</p>
                <div className="afr-cat-btn"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRODUTOS EM DESTAQUE */}
      <section className="afr-section-products">
        <div className="afr-products-header">
          <div>
            <p className="afr-products-label">PRODUTOS EM DESTAQUE</p>
            <h3 className="afr-products-title">Qualidade que gera resultado!</h3>
          </div>
        </div>
        <div className="afr-products-grid">
          {featuredProducts.map((p, i) => (
            <div className="afr-product-card" key={i}>
              <img src={p.image} alt={p.name} />
              <div className="afr-product-card-info">
                <h4>{p.name}</h4>
                <div className="afr-product-price">{p.price} <span className="afr-product-unit">{p.unit}</span></div>
              </div>
              <button className="afr-product-add">+ Adicionar</button>
            </div>
          ))}
        </div>
        <button className="afr-view-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          Ver Todos os Produtos
        </button>
      </section>

      {/* CATÁLOGOS */}
      {[
        { key: 'insumos', label: 'INSUMOS AGRÍCOLAS', colorClass: 'insumos', icon: <svg viewBox="0 0 24 24"><path d="M12 2C9 2 6 4 5 7C4 10 5 13 7 15C9 17 11 17 11 20H13C13 17 15 17 17 15C19 13 20 10 19 7C18 4 15 2 12 2Z"/></svg> },
        { key: 'tecnologia', label: 'TECNOLOGIA DE APLICAÇÃO', colorClass: 'tecnologia', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg> },
        { key: 'plantio', label: 'PLANTIO E PREPARO DE SOLO', colorClass: 'plantio', icon: <svg viewBox="0 0 24 24"><path d="M3 9L12 2L21 9V20A2 2 0 0119 22H5A2 2 0 013 20V9Z"/></svg> },
      ].map(cat => {
        const catalog = catalogs[cat.key as keyof typeof catalogs];
        return (
          <div className={`afr-catalog-row ${cat.colorClass}`} key={cat.key}>
            <div className="afr-catalog-info">
              <div className="afr-catalog-info-icon">{cat.icon}</div>
              <h3>{cat.label}</h3>
              <p>{catalog.description}</p>
              <a href="#">Ver Todos <svg viewBox="0 0 24 24" style={{width:14,height:14,stroke:'#fff',fill:'none',strokeWidth:2.5,display:'inline',marginLeft:4}}><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
            </div>
            <div className="afr-catalog-products">
              {catalog.products.map((p, i) => (
                <div className="afr-catalog-product" key={i}>
                  <img src={p.image} alt={p.name} />
                  <div className="afr-catalog-product-info">
                    <h4>{p.name}</h4>
                    <span>{p.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* POR QUE AGROFORTE */}
      <section className="afr-section-why">
        <p className="afr-why-label">Por que escolher AgroForte?</p>
        <h3 className="afr-why-title">Mais que produtos, entregamos parceria, confiança e soluções que impulsionam o campo.</h3>
        <div className="afr-why-grid">
          {[
            { icon: <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>, title: 'Produtos de Qualidade', text: 'Selecionamos o melhor para cada etapa do campo.' },
            { icon: <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>, title: 'Atendimento Especializado', text: 'Nossa equipe está sempre ao lado para te atender da melhor forma.' },
            { icon: <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, title: 'Parceiros de Confiança', text: 'Trabalhamos com as melhores marcas do mercado.' },
            { icon: <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>, title: 'Foco em Resultados', text: 'Soluções que geram mais produtividade e lucro.' },
          ].map(item => (
            <div className="afr-why-item" key={item.title}>
              <div className="afr-why-icon">{item.icon}</div>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="afr-section-cta" id="contato">
        <div className="afr-cta-inner">
          <h2 className="afr-cta-title">Vamos juntos <em>fortalecer o agronegócio!</em></h2>
          <div className="afr-cta-form">
            <input className="afr-cta-input" type="text" placeholder="Seu nome" />
            <input className="afr-cta-input" type="text" placeholder="Seu WhatsApp" />
            <input className="afr-cta-input" type="text" placeholder="Sua mensagem" />
            <button className="afr-cta-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Enviar
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="afr-footer">
        <div className="afr-footer-top">
          <div>
            <div className="afr-footer-brand">{brandFirst}<em>{brandSecond}</em></div>
            <p className="afr-footer-tag">{brand.tagline}</p>
            <div className="afr-footer-social">
              <a href="#"><svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg></a>
              <a href="#"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01"/></svg></a>
              <a href="#"><svg viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg></a>
            </div>
          </div>
          <div className="afr-footer-col">
            <h4>NAVEGAÇÃO</h4>
            <ul>{safeNavLinks.map((link, idx) => <li key={idx}><a href={link.url}>{link.label}</a></li>)}</ul>
          </div>
          <div className="afr-footer-col">
            <h4>PRODUTOS</h4>
            <ul>{['Insumos Agrícolas', 'Tecnologia de Aplicação', 'Plantio e Preparo de Solo'].map(l => <li key={l}><a href="#">{l}</a></li>)}</ul>
          </div>
          <div className="afr-footer-col">
            <h4>CONTATO</h4>
            <div className="afr-contact-row">
              <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.47 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 013.38 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.91 8.96a16 16 0 006.07 6.07l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              {footer.phone}
            </div>
            <div className="afr-contact-row">
              <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {footer.email}
            </div>
            <div className="afr-contact-row">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {footer.address}
            </div>
          </div>
        </div>
        <div className="afr-footer-bottom">
          <p>{footer.copyright}</p>
          <p>Desenvolvido com Byfrost</p>
        </div>
      </footer>
    </div>
  );
}
