import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgroForteData } from './agroforte-types';

interface GlobalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AgroForteData | null;
  onChange: (updates: Partial<AgroForteData>) => void;
}

const FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Lato',
  'Poppins',
  'system-ui',
  'sans-serif'
];

export function GlobalSettingsModal({ open, onOpenChange, data, onChange }: GlobalSettingsModalProps) {
  const globalSettings = data?.globalSettings || {};
  const typography = globalSettings.typography || {};

  const updateTypography = (key: string, value: string) => {
    onChange({
      globalSettings: {
        ...globalSettings,
        typography: {
          ...typography,
          [key]: value
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurações Gerais do Site</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-4 border rounded-xl p-4">
            <h4 className="font-semibold text-sm">Tipografia Global</h4>
            
            <div className="space-y-2">
              <Label>Fonte Padrão</Label>
              <Select 
                value={typography.fontFamily || 'Inter'} 
                onValueChange={(val) => updateTypography('fontFamily', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma fonte" />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map(font => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Tamanho H1 (px)</Label>
                <Input 
                  type="number" 
                  value={typography.h1Size || ''} 
                  placeholder="Ex: 40"
                  onChange={(e) => updateTypography('h1Size', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho H2 (px)</Label>
                <Input 
                  type="number" 
                  value={typography.h2Size || ''} 
                  placeholder="Ex: 32"
                  onChange={(e) => updateTypography('h2Size', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho H3 (px)</Label>
                <Input 
                  type="number" 
                  value={typography.h3Size || ''} 
                  placeholder="Ex: 28"
                  onChange={(e) => updateTypography('h3Size', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho H4 (px)</Label>
                <Input 
                  type="number" 
                  value={typography.h4Size || ''} 
                  placeholder="Ex: 24"
                  onChange={(e) => updateTypography('h4Size', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho Texto Padrão (p) (px)</Label>
                <Input 
                  type="number" 
                  value={typography.pSize || ''} 
                  placeholder="Ex: 16"
                  onChange={(e) => updateTypography('pSize', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho Negrito (b) (px)</Label>
                <Input 
                  type="number" 
                  value={typography.bSize || ''} 
                  placeholder="Ex: 16"
                  onChange={(e) => updateTypography('bSize', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho Itálico (i) (px)</Label>
                <Input 
                  type="number" 
                  value={typography.iSize || ''} 
                  placeholder="Ex: 16"
                  onChange={(e) => updateTypography('iSize', e.target.value)} 
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 pt-2">
              Deixe em branco para usar o tamanho padrão do tema.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
