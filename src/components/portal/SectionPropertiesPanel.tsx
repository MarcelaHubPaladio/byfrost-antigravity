import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ImageUpload } from '@/components/portal/ImageUpload';

export function SectionPropertiesPanel({ section, onChange }: { section: any, onChange: (updates: any) => void }) {
    if (!section) return null;
    const settings = section.settings || {};

    const updateSettings = (updates: any) => {
        onChange({ ...settings, ...updates });
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Cor de Fundo (CSS)</Label>
                <Input 
                    value={settings.backgroundColor || ''} 
                    onChange={e => updateSettings({ backgroundColor: e.target.value })}
                    className="text-sm"
                    placeholder="ex: #ffffff, bg-slate-900"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Tema (Cores do texto)</Label>
                <Select value={settings.theme || 'light'} onValueChange={v => updateSettings({ theme: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="light">Claro (textos escuros)</SelectItem>
                        <SelectItem value="dark">Escuro (textos claros)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-600">Espaçamento Vertical (Padding Y)</Label>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{settings.paddingY || '16'}</span>
                </div>
                <Slider
                    value={[settings.paddingY ? Number(settings.paddingY) : 16]}
                    min={0}
                    max={64}
                    step={1}
                    onValueChange={([v]) => updateSettings({ paddingY: String(v) })}
                />
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-600">Espaçamento Horizontal (Padding X)</Label>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{settings.paddingX || '0'}</span>
                </div>
                <Slider
                    value={[settings.paddingX ? Number(settings.paddingX) : 0]}
                    min={0}
                    max={64}
                    step={1}
                    onValueChange={([v]) => updateSettings({ paddingX: String(v) })}
                />
            </div>
            
            <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Imagem de Fundo</Label>
                <ImageUpload 
                    value={settings.backgroundImage || ''}
                    onChange={(url) => updateSettings({ backgroundImage: url })}
                />
            </div>
        </div>
    );
}
