import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ImageUpload } from '@/components/portal/ImageUpload';
import { 
    Moon, Settings, Paintbrush, Image as ImageIcon, Link as LinkIcon, Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ColumnPropertiesPanel({ column, onChange }: { column: any, onChange: (updates: any) => void }) {
    if (!column) return null;
    
    const settings = column.settings || {};
    const styleSettings = column.settings?.style || {};

    const updateSettings = (updates: any) => {
        onChange({ ...settings, ...updates });
    };

    const updateStyle = (group: string, updates: any) => {
        const newStyle = {
            ...styleSettings,
            [group]: {
                ...(styleSettings[group] || {}),
                ...updates
            }
        };
        onChange({ ...settings, style: newStyle });
    };

    return (
        <Tabs defaultValue="estilo" className="w-full -mx-4 -mt-4 w-[calc(100%+2rem)]">
            <TabsList className={cn("w-full grid h-14 bg-slate-100 rounded-t-xl rounded-b-none p-1 border-b border-slate-200", "grid-cols-2")}>
                <TabsTrigger value="estilo" className="flex flex-col items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-500 data-[state=active]:shadow-sm">
                    <Moon className="h-4 w-4" />
                    <span className="text-[9px] uppercase font-bold tracking-wider">Estilo</span>
                </TabsTrigger>
                <TabsTrigger value="avancado" className="flex flex-col items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-500 data-[state=active]:shadow-sm">
                    <Settings className="h-4 w-4" />
                    <span className="text-[9px] uppercase font-bold tracking-wider">Avançado</span>
                </TabsTrigger>
            </TabsList>
            <div className="bg-white p-0 text-slate-800 min-h-[500px]">
                <TabsContent value="estilo" className="mt-0">
                    <Accordion type="multiple" defaultValue={["background", "spacing", "border", "typography"]} className="w-full">
                        
                        {/* BACKGROUND */}
                        <AccordionItem value="background" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Background
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <Tabs defaultValue={styleSettings.background?.image ? "image" : "classic"} className="w-full">
                                    <TabsList className="w-full grid grid-cols-2 h-8 mb-4">
                                        <TabsTrigger value="classic" className="text-[10px] flex gap-2"><Paintbrush className="h-3 w-3" /> Clássico</TabsTrigger>
                                        <TabsTrigger value="image" className="text-[10px] flex gap-2"><ImageIcon className="h-3 w-3" /> Imagem</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="classic" className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-slate-600 font-medium">Cor</Label>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden">
                                                    <input 
                                                        type="color" 
                                                        className="w-10 h-10 -ml-2 -mt-2 cursor-pointer"
                                                        value={styleSettings.background?.color || '#ffffff'}
                                                        onChange={(e) => updateStyle('background', { color: e.target.value })}
                                                    />
                                                </div>
                                                <Input 
                                                    className="w-24 h-8 text-xs font-mono" 
                                                    value={styleSettings.background?.color || ''}
                                                    onChange={(e) => updateStyle('background', { color: e.target.value })}
                                                    placeholder="Transparente"
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="image" className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-slate-600 font-medium">Imagem de Fundo</Label>
                                            <ImageUpload 
                                                value={styleSettings.background?.image || ''}
                                                onChange={(url) => updateStyle('background', { image: url })}
                                            />
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </AccordionContent>
                        </AccordionItem>

                        {/* SPACING */}
                        <AccordionItem value="spacing" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Spacing
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs text-slate-600 font-medium">Padding X (Lateral)</Label>
                                            <Monitor className="h-3 w-3 text-slate-400" />
                                        </div>
                                        <span className="text-xs text-slate-400 font-mono w-8 text-right">{settings.paddingX || 0}</span>
                                    </div>
                                    <Slider 
                                        value={[settings.paddingX || 0]} 
                                        max={32} 
                                        step={1}
                                        onValueChange={v => updateSettings({ paddingX: v[0] })}
                                    />
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs text-slate-600 font-medium">Padding Y (Vertical)</Label>
                                            <Monitor className="h-3 w-3 text-slate-400" />
                                        </div>
                                        <span className="text-xs text-slate-400 font-mono w-8 text-right">{settings.paddingY || 0}</span>
                                    </div>
                                    <Slider 
                                        value={[settings.paddingY || 0]} 
                                        max={32} 
                                        step={1}
                                        onValueChange={v => updateSettings({ paddingY: v[0] })}
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        {/* BORDER */}
                        <AccordionItem value="border" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Border
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-600 font-medium">Tipo</Label>
                                    <Select value={styleSettings.border?.type || 'none'} onValueChange={v => updateStyle('border', { type: v })}>
                                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Nenhum</SelectItem>
                                            <SelectItem value="solid">Sólido</SelectItem>
                                            <SelectItem value="dashed">Tracejado</SelectItem>
                                            <SelectItem value="dotted">Pontilhado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {styleSettings.border?.type && styleSettings.border.type !== 'none' && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-slate-600 font-medium">Espessura (px)</Label>
                                            <Slider 
                                                className="w-32"
                                                value={[styleSettings.border?.width || 1]} 
                                                max={10} 
                                                step={1}
                                                onValueChange={v => updateStyle('border', { width: v[0] })}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-slate-600 font-medium">Cor</Label>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden">
                                                    <input 
                                                        type="color" 
                                                        className="w-10 h-10 -ml-2 -mt-2 cursor-pointer"
                                                        value={styleSettings.border?.color || '#000000'}
                                                        onChange={(e) => updateStyle('border', { color: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-slate-600 font-medium">Arredondamento (px)</Label>
                                        <span className="text-xs text-slate-400 font-mono w-8 text-right">{styleSettings.border?.radius || 0}</span>
                                    </div>
                                    <Slider 
                                        value={[styleSettings.border?.radius || 0]} 
                                        max={100} 
                                        step={1}
                                        onValueChange={v => updateStyle('border', { radius: v[0] })}
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </TabsContent>

                <TabsContent value="avancado" className="mt-0">
                    <Accordion type="multiple" defaultValue={["avancado"]} className="w-full">
                        <AccordionItem value="avancado" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Avançado
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <div className="flex items-center gap-4 pt-2">
                                    <Label className="text-xs text-slate-600 font-medium w-20">Z-Index</Label>
                                    <Input 
                                        className="w-24 h-8 text-xs" 
                                        value={settings.zIndex || ''}
                                        onChange={(e) => updateSettings({ zIndex: e.target.value })}
                                        placeholder="auto"
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <Label className="text-xs text-slate-600 font-medium w-20">ID CSS</Label>
                                    <Input 
                                        className="flex-1 h-8 text-xs"
                                        value={settings.cssId || ''}
                                        onChange={(e) => updateSettings({ cssId: e.target.value })}
                                        placeholder="Ex: coluna-1"
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <Label className="text-xs text-slate-600 font-medium w-20">Classe CSS</Label>
                                    <Input 
                                        className="flex-1 h-8 text-xs" 
                                        value={settings.cssClasses || ''}
                                        onChange={(e) => updateSettings({ cssClasses: e.target.value })}
                                        placeholder="Ex: min-h-screen custom-bg"
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </TabsContent>
            </div>
        </Tabs>
    );
}
