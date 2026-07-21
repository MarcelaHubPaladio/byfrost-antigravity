import re

# 1. Update SectionPropertiesPanel.tsx slider
with open("src/components/portal/SectionPropertiesPanel.tsx", "r") as f:
    content = f.read()

old_slider = """                                    <div className="flex items-center gap-4">
                                        <Slider
                                            className="flex-1"
                                            value={[settings.width ? Number(settings.width) : 100]}
                                            min={0}
                                            max={100}
                                            step={1}
                                            onValueChange={([v]) => updateSettings({ width: String(v) })}
                                        />
                                        <div className="w-12 h-8 bg-slate-50 border border-slate-200 rounded text-center text-xs flex items-center justify-center">
                                            {settings.width || 100}
                                        </div>"""

new_slider = """                                    <div className="flex items-center gap-4">
                                        <Slider
                                            className="flex-1"
                                            value={[settings.widthValue ? Number(settings.widthValue) : 1280]}
                                            min={300}
                                            max={1920}
                                            step={10}
                                            onValueChange={([v]) => updateSettings({ widthValue: String(v) })}
                                        />
                                        <div className="w-12 h-8 bg-slate-50 border border-slate-200 rounded text-center text-xs flex items-center justify-center">
                                            {settings.widthValue || 1280}
                                        </div>"""
content = content.replace(old_slider, new_slider)
with open("src/components/portal/SectionPropertiesPanel.tsx", "w") as f:
    f.write(content)

# 2. Update PortalEditor.tsx columns alignment
with open("src/pages/PortalEditor.tsx", "r") as f:
    content = f.read()

old_col = """                                    <div style={{ width: previewMode === 'mobile' ? '100%' : `${col.size}%` }} className="flex flex-col gap-4 relative group/col">"""
new_col = """                                    <div style={{ 
                                        width: previewMode === 'mobile' ? '100%' : `${col.size}%`,
                                        alignItems: section.settings?.justifyContent === 'center' ? 'center' : section.settings?.justifyContent === 'right' ? 'flex-end' : 'stretch'
                                    }} className="flex flex-col gap-4 relative group/col">"""
content = content.replace(old_col, new_col)
with open("src/pages/PortalEditor.tsx", "w") as f:
    f.write(content)

# 3. Update PublicPortal.tsx columns alignment
with open("src/pages/PublicPortal.tsx", "r") as f:
    content = f.read()

old_col_pub = """                                            <div key={col.id} style={{ width: isMobile ? '100%' : `${col.size}%` }} className="flex flex-col gap-4">"""
new_col_pub = """                                            <div key={col.id} style={{ 
                                                width: isMobile ? '100%' : `${col.size}%`,
                                                alignItems: effectiveSettings.justifyContent === 'center' ? 'center' : effectiveSettings.justifyContent === 'right' ? 'flex-end' : 'stretch'
                                            }} className="flex flex-col gap-4">"""
content = content.replace(old_col_pub, new_col_pub)
with open("src/pages/PublicPortal.tsx", "w") as f:
    f.write(content)

