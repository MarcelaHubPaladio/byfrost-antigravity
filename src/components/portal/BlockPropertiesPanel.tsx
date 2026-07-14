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
import { ImageUpload } from './ImageUpload';

export function BlockPropertiesPanel({ block, onChange }: { block: any, onChange: (updates: any) => void }) {
    if (!block) return null;
    const content = block.content || {};

    const updateContent = (updates: any) => {
        onChange(updates);
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

    if (block.type === 'image') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs">Escolher imagem</Label>
                    <ImageUpload 
                        value={content.url || ''}
                        onChange={v => updateContent({ url: v })}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Tamanho da imagem</Label>
                    <Select value={content.size || 'full'} onValueChange={v => updateContent({ size: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="thumbnail">Thumbnail - 150 x 150</SelectItem>
                            <SelectItem value="medium">Medium - 300 x 300</SelectItem>
                            <SelectItem value="large">Large - 1024 x 1024</SelectItem>
                            <SelectItem value="full">Full</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Alinhamento</Label>
                    <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-100/50 p-1 gap-1">
                        {[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }].map(({ value, icon: Icon }) => (
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
                <div className="space-y-2">
                    <Label className="text-xs">Legenda</Label>
                    <Select value={content.captionType || 'none'} onValueChange={v => updateContent({ captionType: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            <SelectItem value="custom">Legenda personalizada</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Link</Label>
                    <Select value={content.linkType || 'none'} onValueChange={v => updateContent({ linkType: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            <SelectItem value="url">URL Personalizada</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    if (block.type === 'button') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={content.variant || 'default'} onValueChange={v => updateContent({ variant: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Padrão</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="success">Sucesso</SelectItem>
                            <SelectItem value="warning">Aviso</SelectItem>
                            <SelectItem value="danger">Perigo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Texto</Label>
                    <Input 
                        value={content.text || ''}
                        onChange={e => updateContent({ text: e.target.value })}
                        className="text-sm h-8"
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Link</Label>
                    <Input 
                        value={content.link || ''}
                        onChange={e => updateContent({ link: e.target.value })}
                        className="text-sm h-8"
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Alinhamento</Label>
                    <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-100/50 p-1 gap-1">
                        {[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }, { value: 'justify', icon: AlignJustify }].map(({ value, icon: Icon }) => (
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
                <div className="space-y-2">
                    <Label className="text-xs">Tamanho</Label>
                    <Select value={content.size || 'small'} onValueChange={v => updateContent({ size: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="small">Pequeno</SelectItem>
                            <SelectItem value="medium">Médio</SelectItem>
                            <SelectItem value="large">Grande</SelectItem>
                            <SelectItem value="xlarge">Extra Grande</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Ícone</Label>
                    <Select value={content.icon || 'none'} onValueChange={v => updateContent({ icon: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            <SelectItem value="upload">Fazer upload (SVG)</SelectItem>
                            <SelectItem value="library">Biblioteca de ícones</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {content.icon && content.icon !== 'none' && (
                    <div className="space-y-2">
                        <Label className="text-xs">Espaço do ícone</Label>
                        <Slider 
                            value={[content.iconSpacing || 8]} 
                            min={0} max={50} step={1}
                            onValueChange={([v]) => updateContent({ iconSpacing: v })}
                        />
                    </div>
                )}
                <div className="space-y-2">
                    <Label className="text-xs">ID do botão</Label>
                    <Input 
                        value={content.buttonId || ''}
                        onChange={e => updateContent({ buttonId: e.target.value })}
                        className="text-sm h-8"
                    />
                    <p className="text-[10px] text-slate-400 italic">Certifique-se de que o ID é único e não é usado em outro lugar na página.</p>
                </div>
            </div>
        );
    }

    if (block.type === 'video') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs">Fonte</Label>
                    <Select value={content.source || 'youtube'} onValueChange={v => updateContent({ source: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="youtube">Youtube</SelectItem>
                            <SelectItem value="vimeo">Vimeo</SelectItem>
                            <SelectItem value="dailymotion">Dailymotion</SelectItem>
                            <SelectItem value="hosted">Hospedado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Link</Label>
                    <Input 
                        value={content.url || ''}
                        onChange={e => updateContent({ url: e.target.value })}
                        className="text-sm h-8"
                        placeholder="https://www.youtube.com/watch?v=..."
                    />
                </div>
                <div className="flex gap-2">
                    <div className="space-y-2 flex-1">
                        <Label className="text-xs">Tempo de início</Label>
                        <Input 
                            value={content.startTime || ''}
                            onChange={e => updateContent({ startTime: e.target.value })}
                            className="text-sm h-8"
                        />
                    </div>
                    <div className="space-y-2 flex-1">
                        <Label className="text-xs">Tempo final</Label>
                        <Input 
                            value={content.endTime || ''}
                            onChange={e => updateContent({ endTime: e.target.value })}
                            className="text-sm h-8"
                        />
                    </div>
                </div>
                <div className="pt-4 border-t border-slate-100">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4 block">Opções do vídeo</Label>
                    <div className="space-y-3">
                        {['autoplay', 'muted', 'loop', 'controls', 'modestbranding', 'privacy', 'lazyload'].map(opt => (
                            <div key={opt} className="flex items-center justify-between">
                                <Label className="text-xs font-medium text-slate-600">{
                                    opt === 'autoplay' ? 'Reproduzir automaticamente' :
                                    opt === 'muted' ? 'Mudo' :
                                    opt === 'loop' ? 'Repetir' :
                                    opt === 'controls' ? 'Controle da reprodução' :
                                    opt === 'modestbranding' ? 'Branding modesto' :
                                    opt === 'privacy' ? 'Modo de privacidade' :
                                    'Lazy Load'
                                }</Label>
                                <Switch 
                                    checked={content[opt] || false}
                                    onCheckedChange={v => updateContent({ [opt]: v })}
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-2 pt-4 border-t border-slate-100">
                    <Label className="text-xs">Vídeos sugeridos</Label>
                    <Select value={content.suggestedVideos || 'current_channel'} onValueChange={v => updateContent({ suggestedVideos: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="current_channel">Vídeo atual do canal</SelectItem>
                            <SelectItem value="any">Qualquer vídeo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    if (block.type === 'icon') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs">Ícone</Label>
                    <ImageUpload 
                        value={content.url || ''}
                        onChange={v => updateContent({ url: v })}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Visualizar</Label>
                    <Select value={content.view || 'default'} onValueChange={v => updateContent({ view: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Padrão</SelectItem>
                            <SelectItem value="stacked">Empilhado</SelectItem>
                            <SelectItem value="framed">Emoldurado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Link</Label>
                    <Input 
                        value={content.link || ''}
                        onChange={e => updateContent({ link: e.target.value })}
                        className="text-sm h-8"
                        placeholder="https://"
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Alinhamento</Label>
                    <div className="flex border border-slate-200 rounded-md overflow-hidden bg-slate-100/50 p-1 gap-1">
                        {[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }].map(({ value, icon: Icon }) => (
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

    return (
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-sm text-slate-500">
            Propriedades específicas para o bloco <strong>{block.type}</strong> serão exibidas aqui.
        </div>
    );
}
