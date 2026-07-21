import re

with open("src/components/portal/SectionPropertiesPanel.tsx", "r") as f:
    content = f.read()

old_vertical = """                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-600 font-medium">Alinhamento vertical</Label>
                                    <Select value={settings.verticalAlign || 'padrao'} onValueChange={v => updateSettings({ verticalAlign: v })}>
                                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="padrao">Padrão</SelectItem>
                                            <SelectItem value="top">Top</SelectItem>
                                            <SelectItem value="middle">Middle</SelectItem>
                                            <SelectItem value="bottom">Bottom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>"""

new_vertical_and_horizontal = """                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-600 font-medium">Alinhamento vertical</Label>
                                    <Select value={settings.verticalAlign || 'padrao'} onValueChange={v => updateSettings({ verticalAlign: v })}>
                                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="padrao">Padrão</SelectItem>
                                            <SelectItem value="top">Top</SelectItem>
                                            <SelectItem value="middle">Middle</SelectItem>
                                            <SelectItem value="bottom">Bottom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-600 font-medium">Alinhamento horizontal</Label>
                                    <Select value={settings.justifyContent || 'padrao'} onValueChange={v => updateSettings({ justifyContent: v })}>
                                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="padrao">Padrão</SelectItem>
                                            <SelectItem value="flex-start">Esquerda</SelectItem>
                                            <SelectItem value="center">Centro</SelectItem>
                                            <SelectItem value="right">Direita</SelectItem>
                                            <SelectItem value="space-between">Espaço-entre</SelectItem>
                                            <SelectItem value="space-around">Espaço-ao-redor</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>"""
content = content.replace(old_vertical, new_vertical_and_horizontal)

with open("src/components/portal/SectionPropertiesPanel.tsx", "w") as f:
    f.write(content)
