import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/RichTextEditor';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BlockPropertiesPanel({ block, onChange }: { block: any, onChange: (updates: any) => void }) {
    if (!block) return null;
    const content = block.content || {};

    const updateContent = (updates: any) => {
        onChange({ content: { ...content, ...updates } });
    };

    if (block.type === 'title') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs">Título</Label>
                    <Textarea 
                        value={content.title || ''} 
                        onChange={e => updateContent({ title: e.target.value })}
                        className="text-sm min-h-[80px]"
                        placeholder="Adicione o texto do seu título aqui"
                    />
                </div>
                
                <div className="space-y-2">
                    <Label className="text-xs">Link</Label>
                    <Input 
                        value={content.link || ''} 
                        onChange={e => updateContent({ link: e.target.value })}
                        className="text-sm"
                        placeholder="Colar URL ou tipo"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Tamanho</Label>
                    <Select value={content.size || 'Padrão'} onValueChange={v => updateContent({ size: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Padrão">Padrão</SelectItem>
                            <SelectItem value="Pequeno">Pequeno</SelectItem>
                            <SelectItem value="Médio">Médio</SelectItem>
                            <SelectItem value="Grande">Grande</SelectItem>
                            <SelectItem value="Gigante">Gigante</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Tag HTML</Label>
                    <Select value={content.htmlTag || 'H2'} onValueChange={v => updateContent({ htmlTag: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'p', 'div', 'span'].map(tag => (
                                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Alinhamento</Label>
                    <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-100/50 p-1 gap-1">
                        {[
                            { value: 'left', icon: AlignLeft },
                            { value: 'center', icon: AlignCenter },
                            { value: 'right', icon: AlignRight },
                            { value: 'justify', icon: AlignJustify },
                        ].map(({ value, icon: Icon }) => (
                            <button
                                key={value}
                                onClick={() => updateContent({ alignment: value })}
                                className={cn(
                                    "flex-1 h-7 flex items-center justify-center rounded transition-colors",
                                    content.alignment === value ? "bg-white shadow-sm border border-slate-200 text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (block.type === 'text') {
        return (
            <div className="space-y-6">
                <div className="space-y-2">
                    <RichTextEditor 
                        value={content.text || ''}
                        onChange={v => updateContent({ text: v })}
                    />
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <Label className="text-xs font-semibold text-slate-600">Letra capitular</Label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{content.dropCap ? 'LIGADO' : 'DESLIGADO'}</span>
                        <Switch 
                            checked={content.dropCap || false} 
                            onCheckedChange={v => updateContent({ dropCap: v })}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-600">Colunas</Label>
                    <Select value={String(content.columns || 'Padrão')} onValueChange={v => updateContent({ columns: v === 'Padrão' ? v : Number(v) })}>
                        <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 text-slate-200 border-slate-700">
                            <SelectItem value="Padrão">Padrão</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="6">6</SelectItem>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="8">8</SelectItem>
                            <SelectItem value="9">9</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-slate-600">Espaçamento da coluna</Label>
                        <div className="flex gap-2 text-[10px] text-slate-400 font-bold">
                            <span className="text-blue-500">PX</span>
                            <span>%</span>
                            <span>EM</span>
                            <span>VW</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Slider
                            value={[content.columnGap || 16]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={([v]) => updateContent({ columnGap: v })}
                            className="flex-1"
                        />
                        <div className="w-12 h-8 bg-slate-800 rounded flex items-center justify-center text-xs text-slate-300">
                            {content.columnGap || 16}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-sm text-slate-500">
            Propriedades específicas para o bloco <strong>{block.type}</strong> serão exibidas aqui.
        </div>
    );
}
