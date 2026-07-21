import re

# 1. Update BlockPropertiesPanel.tsx
with open("src/components/portal/BlockPropertiesPanel.tsx", "r") as f:
    content = f.read()

imports = """import { cn } from '@/lib/utils';
import { ImageUpload } from './ImageUpload';
import { IconPicker } from '@/components/media-kit/IconPicker';
import { DynamicIcon } from './DynamicIcon';
import { Button } from '@/components/ui/button';"""

content = content.replace("import { cn } from '@/lib/utils';\nimport { ImageUpload } from './ImageUpload';", imports)

icon_editor = """    if (block.type === 'icon') {
        return <IconBlockEditor content={content} updateContent={updateContent} />;
    }"""

# Replace the whole icon block
content = re.sub(r"    if \(block\.type === 'icon'\) \{[\s\S]*?    \}", icon_editor, content, count=1)

icon_block_editor_comp = """
function IconBlockEditor({ content, updateContent }: { content: any, updateContent: (u: any) => void }) {
    const [isIconPickerOpen, setIsIconPickerOpen] = React.useState(false);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Origem do Ícone</Label>
                <Select value={content.source || 'upload'} onValueChange={v => updateContent({ source: v })}>
                    <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="upload">Upload de Imagem</SelectItem>
                        <SelectItem value="system">Sistema (Ícones Prontos)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {content.source === 'system' ? (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ícone do Sistema</Label>
                        <div className="flex gap-2 items-center">
                            <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center text-slate-500">
                                {content.iconName ? (
                                    <DynamicIcon name={content.iconName} lib={content.iconLib} className="w-5 h-5" />
                                ) : (
                                    <span className="text-[10px]">Nenhum</span>
                                )}
                            </div>
                            <Button variant="outline" className="flex-1 text-xs h-10 bg-white" onClick={() => setIsIconPickerOpen(true)}>
                                Escolher Ícone
                            </Button>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                            <span>Tamanho</span>
                            <span>{content.iconSize || 48}px</span>
                        </Label>
                        <Slider 
                            value={[content.iconSize || 48]} 
                            min={16} max={200} step={4}
                            onValueChange={v => updateContent({ iconSize: v[0] })}
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cor do Ícone</Label>
                        <div className="flex gap-2">
                            <Input 
                                type="color" 
                                value={content.iconColor || '#000000'}
                                onChange={e => updateContent({ iconColor: e.target.value })}
                                className="w-10 h-10 p-1 bg-white cursor-pointer"
                            />
                            <Input 
                                type="text" 
                                value={content.iconColor || '#000000'}
                                onChange={e => updateContent({ iconColor: e.target.value })}
                                className="flex-1 h-10 text-xs bg-white"
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Imagem</Label>
                    <ImageUpload 
                        value={content.url || ''}
                        onChange={v => updateContent({ url: v })}
                    />
                    <div className="space-y-2 mt-4">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                            <span>Tamanho Máximo</span>
                            <span>{content.iconSize || 48}px</span>
                        </Label>
                        <Slider 
                            value={[content.iconSize || 48]} 
                            min={16} max={300} step={4}
                            onValueChange={v => updateContent({ iconSize: v[0] })}
                        />
                    </div>
                </div>
            )}
            
            <IconPicker
                open={isIconPickerOpen}
                onOpenChange={setIsIconPickerOpen}
                onSelect={(name, lib) => updateContent({ iconName: name, iconLib: lib })}
            />

            <div className="space-y-2 border-t border-slate-100 pt-4">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Link (Opcional)</Label>
                <Input 
                    value={content.link || ''}
                    onChange={e => updateContent({ link: e.target.value })}
                    className="text-sm h-10 bg-white"
                    placeholder="https://"
                />
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alinhamento</Label>
                <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white p-1 gap-1">
                    {[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }].map(({ value, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => updateContent({ alignment: value })}
                            className={cn(
                                "flex-1 h-8 flex items-center justify-center rounded transition-colors",
                                content.alignment === value ? "bg-slate-100 shadow-sm border border-slate-200 text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
"""

content = content + "\n" + icon_block_editor_comp

with open("src/components/portal/BlockPropertiesPanel.tsx", "w") as f:
    f.write(content)

# 2. Update PortalBlockRenderer.tsx
with open("src/components/portal/PortalBlockRenderer.tsx", "r") as f:
    renderer_content = f.read()

renderer_imports = """import { cn } from '@/lib/utils';
import { DynamicIcon } from './DynamicIcon';"""
renderer_content = renderer_content.replace("import { cn } from '@/lib/utils';", renderer_imports)

renderer_icon = """            {block.type === 'icon' && (
                <div className={cn("w-full py-4 flex", 
                    block.content?.alignment === 'center' ? 'justify-center' : 
                    block.content?.alignment === 'right' ? 'justify-end' : 'justify-start'
                )}>
                    {block.content?.link ? (
                        <a href={block.content.link} className="block transition-transform hover:scale-105">
                            {renderIconInner(block.content)}
                        </a>
                    ) : (
                        renderIconInner(block.content)
                    )}
                </div>
            )}"""

inner_func = """    const renderIconInner = (content: any) => {
        if (content?.source === 'system' && content?.iconName) {
            return (
                <DynamicIcon 
                    name={content.iconName} 
                    lib={content.iconLib} 
                    style={{ 
                        color: content.iconColor || '#000000',
                        width: content.iconSize ? `${content.iconSize}px` : '48px',
                        height: content.iconSize ? `${content.iconSize}px` : '48px'
                    }} 
                />
            );
        }
        
        if (content?.source === 'upload' || !content?.source) {
            if (content?.url) {
                return <img src={content.url} alt="Icon" className="object-contain" style={{ width: content.iconSize ? `${content.iconSize}px` : '48px', height: content.iconSize ? `${content.iconSize}px` : '48px' }} />;
            }
        }
        
        return (
            <div className="bg-slate-100 rounded flex items-center justify-center text-slate-400" style={{ width: content.iconSize ? `${content.iconSize}px` : '48px', height: content.iconSize ? `${content.iconSize}px` : '48px' }}>
                ★
            </div>
        );
    };"""

# Replace the block
renderer_content = re.sub(r"            \{block\.type === 'icon' && \([\s\S]*?            \)\}", renderer_icon, renderer_content)

# Inject inner function inside PortalBlockRenderer component
renderer_content = renderer_content.replace(
    "    if (!block) return null;",
    "    if (!block) return null;\n\n" + inner_func
)

with open("src/components/portal/PortalBlockRenderer.tsx", "w") as f:
    f.write(renderer_content)

