import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ImageUpload } from '@/components/portal/ImageUpload';
import { 
    LayoutTemplate, Moon, Settings, 
    Paintbrush, Image as ImageIcon, Video, Square, Circle, Triangle,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Link as LinkIcon, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function SectionPropertiesPanel({ section, onChange }: { section: any, onChange: (updates: any) => void }) {
    if (!section) return null;
    const settings = section.settings || {};
    const styleSettings = section.settings?.style || {};

    const updateSettings = (updates: any) => {
        onChange({ ...settings, ...updates });
    };

    const updateStyle = (group: string, updates: any) => {
        onChange({
            ...settings,
            style: {
                ...styleSettings,
                [group]: {
                    ...(styleSettings[group] || {}),
                    ...updates
                }
            }
        });
    };

    return (
        <Tabs defaultValue="estilo" className="w-full -mx-4 -mt-4 w-[calc(100%+2rem)]">
            <TabsList className="w-full grid grid-cols-3 h-14 bg-slate-100 rounded-t-xl rounded-b-none p-1 border-b border-slate-200">
                <TabsTrigger value="layout" className="flex flex-col items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-500 data-[state=active]:shadow-sm">
                    <LayoutTemplate className="h-4 w-4" />
                    <span className="text-[9px] uppercase font-bold tracking-wider">Layout</span>
                </TabsTrigger>
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
                <TabsContent value="layout" className="p-6 space-y-8 mt-0">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-700">Espaçamento Y</Label>
                            <span className="text-[10px] text-slate-500 font-bold uppercase bg-slate-100 px-2 py-1 rounded">{settings.paddingY || '16'}</span>
                        </div>
                        <div className="px-2">
                            <Slider
                                value={[settings.paddingY ? Number(settings.paddingY) : 16]}
                                min={0}
                                max={64}
                                step={1}
                                onValueChange={([v]) => updateSettings({ paddingY: String(v) })}
                            />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-700">Espaçamento X</Label>
                            <span className="text-[10px] text-slate-500 font-bold uppercase bg-slate-100 px-2 py-1 rounded">{settings.paddingX || '0'}</span>
                        </div>
                        <div className="px-2">
                            <Slider
                                value={[settings.paddingX ? Number(settings.paddingX) : 0]}
                                min={0}
                                max={64}
                                step={1}
                                onValueChange={([v]) => updateSettings({ paddingX: String(v) })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-700">Tema (Cores do texto)</Label>
                        <Select value={settings.theme || 'light'} onValueChange={v => updateSettings({ theme: v })}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">Claro</SelectItem>
                                <SelectItem value="dark">Escuro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </TabsContent>

                <TabsContent value="estilo" className="mt-0">
                    <Accordion type="multiple" defaultValue={["fundo"]} className="w-full">
                        
                        {/* FUNDO */}
                        <AccordionItem value="fundo" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Fundo
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <Tabs defaultValue="normal" className="w-full">
                                    <TabsList className="w-full h-8 bg-slate-100 p-0.5">
                                        <TabsTrigger value="normal" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Normal</TabsTrigger>
                                        <TabsTrigger value="hover" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Hover</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="normal" className="space-y-4 mt-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-slate-600 font-medium">Tipo de fundo</Label>
                                            <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-50">
                                                <button className="p-2 hover:bg-slate-200 text-slate-500"><Paintbrush className="h-3.5 w-3.5" /></button>
                                                <button className="p-2 hover:bg-slate-200 text-slate-500"><Square className="h-3.5 w-3.5" /></button>
                                                <button className="p-2 hover:bg-slate-200 text-slate-500"><Video className="h-3.5 w-3.5" /></button>
                                                <button className="p-2 hover:bg-slate-200 text-slate-500"><ImageIcon className="h-3.5 w-3.5" /></button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Label className="text-xs text-slate-600 font-medium w-16">Cor</Label>
                                            <Input 
                                                value={styleSettings.background?.color || settings.backgroundColor || ''}
                                                onChange={e => updateStyle('background', { color: e.target.value })}
                                                className="flex-1 h-9 text-sm"
                                                placeholder="#ffffff"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-slate-600 font-medium">Imagem</Label>
                                            <ImageUpload 
                                                value={styleSettings.background?.image || settings.backgroundImage || ''}
                                                onChange={(url) => updateStyle('background', { image: url })}
                                            />
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </AccordionContent>
                        </AccordionItem>

                        {/* SCROLLING EFFECTS & MOUSE EFFECTS */}
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Scrolling Effects</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-slate-400">OFF</span>
                                <Switch />
                            </div>
                        </div>
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Mouse Effects</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-slate-400">OFF</span>
                                <Switch />
                            </div>
                        </div>

                        {/* SOBREPOSIÇÃO DE FUNDO */}
                        <AccordionItem value="overlay" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Sobreposição de fundo
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <Tabs defaultValue="normal" className="w-full">
                                    <TabsList className="w-full h-8 bg-slate-100 p-0.5">
                                        <TabsTrigger value="normal" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Normal</TabsTrigger>
                                        <TabsTrigger value="hover" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Hover</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="normal" className="space-y-4 mt-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-slate-600 font-medium">Tipo de fundo</Label>
                                            <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-50">
                                                <button className="p-2 hover:bg-slate-200 text-slate-500"><Paintbrush className="h-3.5 w-3.5" /></button>
                                                <button className="p-2 hover:bg-slate-200 text-slate-500"><Square className="h-3.5 w-3.5" /></button>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </AccordionContent>
                        </AccordionItem>

                        {/* BORDA */}
                        <AccordionItem value="border" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Borda
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <Tabs defaultValue="normal" className="w-full">
                                    <TabsList className="w-full h-8 bg-slate-100 p-0.5">
                                        <TabsTrigger value="normal" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Normal</TabsTrigger>
                                        <TabsTrigger value="hover" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Hover</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="normal" className="space-y-4 mt-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-slate-600 font-medium">Tipo de borda</Label>
                                            <Select value={styleSettings.border?.type || 'none'} onValueChange={v => updateStyle('border', { type: v })}>
                                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Nenhum</SelectItem>
                                                    <SelectItem value="solid">Sólido</SelectItem>
                                                    <SelectItem value="dashed">Tracejado</SelectItem>
                                                    <SelectItem value="dotted">Pontilhado</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs text-slate-600 font-medium">Arredondamento</Label>
                                                <div className="flex gap-2 text-[9px] text-slate-500 font-bold">
                                                    <span className="text-blue-600 border-b border-blue-600">PX</span>
                                                    <span>%</span>
                                                </div>
                                            </div>
                                            <div className="flex bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
                                                <div className="flex-1 border-r border-slate-200">
                                                    <Input className="h-8 bg-transparent border-0 text-center text-xs p-0 focus-visible:ring-0" placeholder="0" />
                                                    <div className="text-[8px] text-center text-slate-400 pb-1">SUPERIOR</div>
                                                </div>
                                                <div className="flex-1 border-r border-slate-200">
                                                    <Input className="h-8 bg-transparent border-0 text-center text-xs p-0 focus-visible:ring-0" placeholder="0" />
                                                    <div className="text-[8px] text-center text-slate-400 pb-1">DIREITA</div>
                                                </div>
                                                <div className="flex-1 border-r border-slate-200">
                                                    <Input className="h-8 bg-transparent border-0 text-center text-xs p-0 focus-visible:ring-0" placeholder="0" />
                                                    <div className="text-[8px] text-center text-slate-400 pb-1">INFERIOR</div>
                                                </div>
                                                <div className="flex-1 border-r border-slate-200">
                                                    <Input className="h-8 bg-transparent border-0 text-center text-xs p-0 focus-visible:ring-0" placeholder="0" />
                                                    <div className="text-[8px] text-center text-slate-400 pb-1">ESQUERDA</div>
                                                </div>
                                                <div className="w-10 bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200">
                                                    <LinkIcon className="h-3.5 w-3.5 text-slate-500" />
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-2">
                                            <Label className="text-xs text-slate-600 font-medium">Sombra do bloco</Label>
                                            <button className="h-8 w-8 rounded-md bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-500">
                                                <Settings className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </AccordionContent>
                        </AccordionItem>

                        {/* DIVISOR DE FORMA */}
                        <AccordionItem value="divider" className="border-slate-100">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Divisor de forma
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                <Tabs defaultValue="superior" className="w-full">
                                    <TabsList className="w-full h-8 bg-slate-100 p-0.5">
                                        <TabsTrigger value="superior" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Superior</TabsTrigger>
                                        <TabsTrigger value="inferior" className="flex-1 text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-500">Inferior</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="superior" className="space-y-4 mt-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-slate-600 font-medium">Tipo</Label>
                                            <Select defaultValue="none">
                                                <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Nenhum</SelectItem>
                                                    <SelectItem value="waves">Ondas</SelectItem>
                                                    <SelectItem value="curve">Curva</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </AccordionContent>
                        </AccordionItem>

                        {/* TIPOGRAFIA */}
                        <AccordionItem value="typography" className="border-none">
                            <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 hover:no-underline">
                                Tipografia
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                                {['Cor de cabeçalho', 'Cor de texto', 'Cor do link', 'Cor do link ao passar o mouse'].map(label => (
                                    <div key={label} className="flex items-center justify-between">
                                        <Label className="text-xs text-slate-600 font-medium">{label}</Label>
                                        <div className="flex border border-slate-200 rounded-md overflow-hidden shadow-sm">
                                            <div className="h-7 w-7 bg-white flex items-center justify-center border-r border-slate-200 cursor-pointer hover:bg-slate-50">
                                                <Globe className="h-3.5 w-3.5 text-slate-400" />
                                            </div>
                                            <div className="h-7 w-7 bg-white flex items-center justify-center cursor-pointer relative overflow-hidden hover:bg-slate-50">
                                                <div className="absolute inset-0 border-t-[1.5px] border-red-500/80 -rotate-45 scale-150"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <div className="flex items-center justify-between pt-2">
                                    <Label className="text-xs text-slate-600 font-medium">Alinhamento de texto</Label>
                                    <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-50">
                                        <button className="p-1.5 hover:bg-slate-200 text-slate-500"><AlignLeft className="h-3.5 w-3.5" /></button>
                                        <button className="p-1.5 hover:bg-slate-200 text-slate-500"><AlignCenter className="h-3.5 w-3.5" /></button>
                                        <button className="p-1.5 hover:bg-slate-200 text-slate-500"><AlignRight className="h-3.5 w-3.5" /></button>
                                        <button className="p-1.5 hover:bg-slate-200 text-slate-500"><AlignJustify className="h-3.5 w-3.5" /></button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                    </Accordion>
                </TabsContent>

                <TabsContent value="avancado" className="p-4 mt-0">
                    <p className="text-sm text-slate-500">Opções avançadas em breve.</p>
                </TabsContent>
            </div>
        </Tabs>
    );
}
