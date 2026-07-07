// AgroForte Data Types & Default Data

export interface AgroForteProduct {
  name: string;
  price: string;
  unit?: string;
  image: string;
}

export interface AgroForteData {
  _template: 'agroforte';
  brand: {
    name: string;
    tagline: string;
    navCta: string;
  };
  hero: {
    headline: string;
    headlineHighlight: string;
    subtitle: string;
    bgImage: string;
    ctaText: string;
    ctaUrl: string;
    badgeTitle: string;
    badgeText: string;
  };
  featuredProducts: AgroForteProduct[];
  catalogs: {
    insumos: { description: string; products: AgroForteProduct[] };
    tecnologia: { description: string; products: AgroForteProduct[] };
    plantio: { description: string; products: AgroForteProduct[] };
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
  },
  hero: {
    headline: 'Cultivando',
    headlineHighlight: 'Confiança,',
    subtitle: 'Soluções completas para o campo, com qualidade, tecnologia e atendimento que faz a diferença.',
    bgImage: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80',
    ctaText: 'Conheça Nossas Soluções',
    ctaUrl: '#',
    badgeTitle: 'QUALIDADE GARANTIDA',
    badgeText: 'Produtos selecionados e parceiros de confiança para o melhor resultado no campo.',
  },
  featuredProducts: [
    { name: 'Semente do Milho', price: 'R$ 245,00', unit: '/saca', image: 'https://images.unsplash.com/photo-1557682250-9af12b8e7db1?w=300&q=80' },
    { name: 'Fertilizante NPK', price: 'R$ 198,00', unit: '/saca', image: 'https://images.unsplash.com/photo-1604537372136-89b3dae196e3?w=300&q=80' },
    { name: 'Defensivo Agrícola', price: 'R$ 320,00', unit: '/litro', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&q=80' },
    { name: 'Semeadora 8 Linhas', price: 'R$ 68.800,00', unit: '', image: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=300&q=80' },
    { name: 'Trator T85s', price: 'R$ 265.000,00', unit: '', image: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=300&q=80' },
    { name: 'Grade Niveladora', price: 'R$ 38.000,00', unit: '', image: 'https://images.unsplash.com/photo-1591696205602-2f950c417cb9?w=300&q=80' },
  ],
  catalogs: {
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
