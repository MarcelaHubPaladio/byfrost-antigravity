import React from 'react';
import type { AgroForteData } from './agroforte-types';

interface GlobalTypographyStylesProps {
  data: AgroForteData | null;
}

export function GlobalTypographyStyles({ data }: GlobalTypographyStylesProps) {
  const typography = data?.globalSettings?.typography;
  if (!typography) return null;

  return (
    <style>{`
      .portal-global-root {
        ${typography.fontFamily ? `font-family: ${typography.fontFamily} !important;` : ''}
      }
      ${typography.h1Size ? `.portal-global-root h1 { font-size: ${typography.h1Size}px !important; }` : ''}
      ${typography.h2Size ? `.portal-global-root h2 { font-size: ${typography.h2Size}px !important; }` : ''}
      ${typography.h3Size ? `.portal-global-root h3 { font-size: ${typography.h3Size}px !important; }` : ''}
      ${typography.h4Size ? `.portal-global-root h4 { font-size: ${typography.h4Size}px !important; }` : ''}
      ${typography.pSize ? `.portal-global-root p, .portal-global-root .prose p, .portal-global-root span { font-size: ${typography.pSize}px !important; }` : ''}
      ${typography.bSize ? `.portal-global-root b, .portal-global-root strong { font-size: ${typography.bSize}px !important; }` : ''}
      ${typography.iSize ? `.portal-global-root i, .portal-global-root em { font-size: ${typography.iSize}px !important; }` : ''}
    `}</style>
  );
}
