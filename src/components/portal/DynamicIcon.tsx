import React from 'react';
import * as LucideIcons from "lucide-react";
import * as FaIcons from "react-icons/fa6";
import * as MdIcons from "react-icons/md";
import * as IoIcons from "react-icons/io5";

interface DynamicIconProps {
  name: string;
  lib?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DynamicIcon({ name, lib, className, style }: DynamicIconProps) {
  let IconComponent: any = null;

  if (lib === 'lucide' || !lib) {
    IconComponent = (LucideIcons as any)[name];
  } else if (lib === 'fa') {
    IconComponent = (FaIcons as any)[name];
  } else if (lib === 'md') {
    IconComponent = (MdIcons as any)[name];
  } else if (lib === 'io') {
    IconComponent = (IoIcons as any)[name];
  }

  if (!IconComponent) {
    // Try to guess by prefix if lib is wrong or not provided
    if (name.startsWith('Fa')) IconComponent = (FaIcons as any)[name];
    else if (name.startsWith('Md')) IconComponent = (MdIcons as any)[name];
    else if (name.startsWith('Io')) IconComponent = (IoIcons as any)[name];
    else IconComponent = (LucideIcons as any)[name];
  }

  if (!IconComponent) {
    const Fallback = LucideIcons.Star;
    return <Fallback className={className} style={style} />;
  }

  return <IconComponent className={className} style={style} />;
}
