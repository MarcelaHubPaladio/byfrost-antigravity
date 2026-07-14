// AgroForte Data Types & Default Data

export interface AgroForteProduct {
  name: string;
  price: string;
  unit?: string;
  image: string;
}

export interface SectionStyleOptions {
  id?: string;
  backgroundColor?: string;
  paddingTop?: string;
  paddingBottom?: string;
  marginTop?: string;
  marginBottom?: string;
}

export type BlockType = 'header' | 'hero' | 'text' | 'title' | 'image' | 'links' | 'divider' | 'html' | 'slider' | 'info-cards' | 'grid' | 'gallery';

export interface AgroForteData {
  _template: 'agroforte';
  theme: 'dark' | 'light' | 'green' | 'blue';
  layoutOrder?: string[];
  layoutSettings?: Record<string, any>;
  brand: {
    name: string;
    tagline: string;
    navCta: string;
    navCtaUrl: string;
    logoImage?: string;
    navLinks: { label: string; url: string }[];
    navBackgroundTop?: string;
    navBackgroundScrolled?: string;
  };
  hero: {
    styles?: SectionStyleOptions;
    autoPlay: boolean;
    interval: number;
    banners: {
      headline: string;
      headlineHighlight: string;
      subtitle: string;
      bgImage: string;
      imagePosition?: string;
      imageFit?: string;
      overlayGradient?: string;
      ctaText: string;
      ctaUrl: string;
      showBadge?: boolean;
      badgeTitle: string;
      badgeText: string;
      badgeIcon?: string;
    }[];
  };
  featuredProducts: AgroForteProduct[];
  featuredProductsStyles?: SectionStyleOptions;
  about?: {
    styles?: SectionStyleOptions;
    label: string;
    headline: string;
    cards: { icon: string; title: string; text: string }[];
  };
  catalogs: {
    styles?: SectionStyleOptions;
    categoriesLabel?: string;
    categories?: { title: string; desc: string; img: string; color: string; icon: string }[];
    insumos: { description: string; products: AgroForteProduct[]; styles?: SectionStyleOptions };
    tecnologia: { description: string; products: AgroForteProduct[]; styles?: SectionStyleOptions };
    plantio: { description: string; products: AgroForteProduct[]; styles?: SectionStyleOptions };
  };
  footer: {
    phone: string;
    email: string;
    address: string;
    copyright: string;
  };
}

export const AGROFORTE_DEFAULT: AgroForteData = {
  _template: 'agroforte',
  brand: {
    name: 'AgroFORTE',
    tagline: 'Soluções Agrícolas',
    navCta: 'Fale Conosco',
    navCtaUrl: '#contato',
    logoImage: '',
    navLinks: [
      { label: 'Início', url: '#' },
      { label: 'Produtos', url: '#produtos' },
      { label: 'Serviços', url: '#servicos' },
      { label: 'Sobre Nós', url: '#sobre' },
      { label: 'Contato', url: '#contato' },
    ],
    navBackgroundTop: 'transparent',
    navBackgroundScrolled: '#1a3a1f',
  },
  hero: {
    autoPlay: true,
    interval: 5,
    banners: [
      {
        headline: 'Cultivando',
        headlineHighlight: 'Confiança,',
        subtitle: 'Soluções completas para o campo, com qualidade, tecnologia e atendimento que faz a diferença.',
        bgImage: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80',
        imagePosition: 'center',
        imageFit: 'cover',
        overlayGradient: 'linear-gradient(135deg, #0d2b0e 0%, #1a3a1f 40%, #2d5a1e 100%)',
        ctaText: 'Conheça Nossas Soluções',
        ctaUrl: '#',
        showBadge: true,
        badgeTitle: 'QUALIDADE GARANTIDA',
        badgeText: 'Produtos selecionados e parceiros de confiança para o melhor resultado no campo.',
        badgeIcon: 'Shield',
      }
    ]
  },
  featuredProducts: [
    { name: 'Fertilizante NPK 10-10-10', price: 'R$ 150,00', unit: '/sc 50kg', image: 'https://images.unsplash.com/photo-1592997571659-0b21ff64313b?w=400&q=80' },
    { name: 'Semente de Milho Híbrido', price: 'R$ 420,00', unit: '/sc 20kg', image: 'https://images.unsplash.com/photo-1574327429676-e1e36fa78486?w=400&q=80' },
    { name: 'Defensivo Agrícola XPTO', price: 'R$ 89,90', unit: '/litro', image: 'https://images.unsplash.com/photo-1563241527-200445d47e8e?w=400&q=80' },
    { name: 'Adubo Foliar Completo', price: 'R$ 120,00', unit: '/galão', image: 'https://images.unsplash.com/photo-1628186105085-f5d8124231b2?w=400&q=80' },
    { name: 'Semente de Soja RR', price: 'R$ 280,00', unit: '/sc 40kg', image: 'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=400&q=80' },
    { name: 'Pulverizador Costal 20L', price: 'R$ 350,00', unit: '/unidade', image: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=400&q=80' }
  ],
  about: {
    label: 'Por que escolher AgroForte?',
    headline: 'Mais que produtos, entregamos parceria, confiança e soluções que impulsionam o campo.',
    cards: [
      { icon: 'Check', title: 'Produtos de Qualidade', text: 'Selecionamos o melhor para cada etapa do campo.' },
      { icon: 'Users', title: 'Atendimento Especializado', text: 'Nossa equipe está sempre ao lado para te atender da melhor forma.' },
      { icon: 'Shield', title: 'Parceiros de Confiança', text: 'Trabalhamos com as melhores marcas do mercado.' },
      { icon: 'Target', title: 'Foco em Resultados', text: 'Soluções que geram mais produtividade e lucro.' },
    ]
  },
  catalogs: {
    categoriesLabel: 'NOSSAS SOLUÇÕES PARA CADA ETAPA DO CAMPO',
    categories: [
      { title: 'INSUMOS AGRÍCOLAS', desc: 'Fertilizantes, sementes e defensivos de alta qualidade para máxima produtividade das lavouras.', img: 'https://images.unsplash.com/photo-1585664811154-4c86e2e5f86d?w=600&q=80', color: 'green', icon: 'Sprout' },
      { title: 'TECNOLOGIA DE APLICAÇÃO', desc: 'Equipamentos e soluções que garantem eficiência e precisão na aplicação.', img: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=600&q=80', color: 'purple', icon: 'Cpu' },
      { title: 'PLANTIO E PREPARO DE SOLO', desc: 'Máquinas e implementos para cultivo, plantio e manejo com mais desempenho.', img: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&q=80', color: 'brown', icon: 'Tractor' },
    ],
    insumos: {
      description: 'Sementes, fertilizantes e defensivos de alta qualidade para garantir a sua lavoura.',
      products: [
        { name: 'Semente de Soja', price: 'R$ 215,00/saca', image: 'https://images.unsplash.com/photo-1557682250-9af12b8e7db1?w=300&q=80' },
        { name: 'Fertilizante NPK', price: 'R$ 185,00/saca', image: 'https://images.unsplash.com/photo-1604537372136-89b3dae196e3?w=300&q=80' },
        { name: 'Calcário Dolomítico', price: 'R$ 68,00/tonelada', image: 'https://images.unsplash.com/photo-1585664811154-4c86e2e5f86d?w=300&q=80' },
        { name: 'Defensivo Agrícola', price: 'R$ 320,00/litro', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&q=80' },
      ],
    },
    tecnologia: {
      description: 'Equipamentos modernos para maior precisão, segurança e eficiência no campo.',
      products: [
        { name: 'Pulverizador 600L', price: 'R$ 40.000,00', image: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=300&q=80' },
        { name: 'Pulverizador Autopropelido', price: 'R$ 690.000,00', image: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=300&q=80' },
        { name: 'Bico de Pulverização Kit', price: 'R$ 35.000,00', image: 'https://images.unsplash.com/photo-1591696205602-2f950c417cb9?w=300&q=80' },
        { name: 'Monitor de Aplicação', price: 'R$ 5.500,00', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&q=80' },
      ],
    },
    plantio: {
      description: 'Máquinas e implementos que garantem o melhor plantio e uma gestão mais produtiva.',
      products: [
        { name: 'Semeadora 9 Linhas', price: 'R$ 68.600,00', image: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=300&q=80' },
        { name: 'Plantadora 16 Linhas', price: 'R$ 124.000,00', image: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=300&q=80' },
        { name: 'Grade Niveladora', price: 'R$ 39.000,00', image: 'https://images.unsplash.com/photo-1591696205602-2f950c417cb9?w=300&q=80' },
        { name: 'Subsolador', price: 'R$ 7.900,00', image: 'https://images.unsplash.com/photo-1604537372136-89b3dae196e3?w=300&q=80' },
      ],
    },
  },
  footer: {
    phone: '(19) 99802-2734',
    email: 'contato@agroforte.com.br',
    address: 'São Maria do Sul - PR',
    copyright: '© 2025 AgroForte. Todos os direitos reservados.',
  },
};
