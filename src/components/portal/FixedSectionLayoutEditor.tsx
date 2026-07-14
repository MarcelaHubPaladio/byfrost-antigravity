import React from 'react';
import { ChevronDown, Monitor } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FixedSectionLayoutSettings {
  contentWidth?: 'boxed' | 'full';
  widthValue?: number;
  columnGap?: string;
  height?: string;
  verticalAlign?: string;
  overflow?: string;
  stretchSection?: boolean;
  htmlTag?: string;
}

interface FixedSectionLayoutEditorProps {
  settings?: FixedSectionLayoutSettings;
  onChange: (settings: FixedSectionLayoutSettings) => void;
}

export function FixedSectionLayoutEditor({ settings = {}, onChange }: FixedSectionLayoutEditorProps) {
  const handleChange = (key: keyof FixedSectionLayoutSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 cursor-pointer">
        <ChevronDown className="h-4 w-4 text-slate-500" />
        <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">Layout</span>
      </div>

      <div className="p-4 space-y-5">
        {/* Largura do conteúdo */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-600 font-medium">Largura do conteúdo</Label>
          <Select 
            value={settings.contentWidth || 'boxed'} 
            onValueChange={(val) => handleChange('contentWidth', val)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="boxed">Boxed</SelectItem>
              <SelectItem value="full">Largura total</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Largura */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-600 font-medium flex items-center gap-2">
              Largura
              <Monitor className="h-3.5 w-3.5 text-slate-400" />
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[settings.widthValue || 1200]}
              min={400}
              max={1920}
              step={10}
              onValueChange={(vals) => handleChange('widthValue', vals[0])}
              className="flex-1"
            />
            <div className="w-16 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-center">
              {settings.widthValue || 1200}
            </div>
          </div>
        </div>

        {/* Espaçamento da coluna */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-600 font-medium">Espaçamento da coluna</Label>
          <Select 
            value={settings.columnGap || 'default'} 
            onValueChange={(val) => handleChange('columnGap', val)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão</SelectItem>
              <SelectItem value="none">Sem espaçamento</SelectItem>
              <SelectItem value="narrow">Estreito</SelectItem>
              <SelectItem value="extended">Estendido</SelectItem>
              <SelectItem value="wide">Largo</SelectItem>
              <SelectItem value="wider">Mais largo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Altura */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-600 font-medium">Altura</Label>
          <Select 
            value={settings.height || 'default'} 
            onValueChange={(val) => handleChange('height', val)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão</SelectItem>
              <SelectItem value="screen">Ajustar à tela</SelectItem>
              <SelectItem value="min">Altura mínima</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alinhamento vertical */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-600 font-medium">Alinhamento vertical</Label>
          <Select 
            value={settings.verticalAlign || 'default'} 
            onValueChange={(val) => handleChange('verticalAlign', val)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão</SelectItem>
              <SelectItem value="top">Superior</SelectItem>
              <SelectItem value="middle">Meio</SelectItem>
              <SelectItem value="bottom">Inferior</SelectItem>
              <SelectItem value="space-between">Espaço entre</SelectItem>
              <SelectItem value="space-around">Espaço ao redor</SelectItem>
              <SelectItem value="space-evenly">Espaço uniforme</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transbordar */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-600 font-medium">Transbordar</Label>
          <Select 
            value={settings.overflow || 'default'} 
            onValueChange={(val) => handleChange('overflow', val)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão</SelectItem>
              <SelectItem value="hidden">Oculto</SelectItem>
              <SelectItem value="auto">Automático</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Esticar seção */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-0.5">
            <Label className="text-xs text-slate-600 font-medium">Esticar seção</Label>
            <p className="text-[10px] text-slate-400 italic">Estique a seção até a largura total da página.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch 
              checked={settings.stretchSection || false}
              onCheckedChange={(val) => handleChange('stretchSection', val)}
            />
            <span className="text-[10px] uppercase font-bold text-slate-400">{settings.stretchSection ? 'SIM' : 'NÃO'}</span>
          </div>
        </div>

        {/* Tag HTML */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Label className="text-xs text-slate-600 font-medium">Tag HTML</Label>
          <Select 
            value={settings.htmlTag || 'default'} 
            onValueChange={(val) => handleChange('htmlTag', val)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão</SelectItem>
              <SelectItem value="div">div</SelectItem>
              <SelectItem value="header">header</SelectItem>
              <SelectItem value="footer">footer</SelectItem>
              <SelectItem value="main">main</SelectItem>
              <SelectItem value="article">article</SelectItem>
              <SelectItem value="section">section</SelectItem>
              <SelectItem value="aside">aside</SelectItem>
              <SelectItem value="nav">nav</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
