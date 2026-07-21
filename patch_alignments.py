import re

# 1. Update PortalEditor.tsx
with open("src/pages/PortalEditor.tsx", "r") as f:
    content = f.read()

old_inner = """                    <div 
                        className={cn("mx-auto flex", previewMode === 'mobile' ? 'w-full flex-col' : section.settings?.contentWidth === 'full' ? 'w-full px-4' : 'w-full px-4', section.settings?.columnGap === 'no-gap' ? 'gap-0' : section.settings?.columnGap === 'extended' ? 'gap-8' : section.settings?.columnGap === 'wide' ? 'gap-12' : 'gap-4')}
                        style={{
                            maxWidth: section.settings?.contentWidth === 'full' ? undefined : section.settings?.widthValue ? `${section.settings.widthValue}px` : '1280px'
                        }}
                    >"""
new_inner = """                    <div 
                        className={cn("mx-auto flex", previewMode === 'mobile' ? 'w-full flex-col' : section.settings?.contentWidth === 'full' ? 'w-full px-4' : 'w-full px-4', section.settings?.columnGap === 'no-gap' ? 'gap-0' : section.settings?.columnGap === 'extended' ? 'gap-8' : section.settings?.columnGap === 'wide' ? 'gap-12' : 'gap-4')}
                        style={{
                            maxWidth: section.settings?.contentWidth === 'full' ? undefined : section.settings?.widthValue ? `${section.settings.widthValue}px` : '1280px',
                            justifyContent: section.settings?.justifyContent === 'center' ? 'center' : section.settings?.justifyContent === 'right' ? 'flex-end' : section.settings?.justifyContent === 'space-between' ? 'space-between' : section.settings?.justifyContent === 'space-around' ? 'space-around' : 'flex-start',
                            alignItems: section.settings?.alignItems === 'middle' ? 'center' : section.settings?.alignItems === 'bottom' ? 'flex-end' : 'stretch'
                        }}
                    >"""
content = content.replace(old_inner, new_inner)

with open("src/pages/PortalEditor.tsx", "w") as f:
    f.write(content)


# 2. Update PublicPortal.tsx
with open("src/pages/PublicPortal.tsx", "r") as f:
    content = f.read()

old_inner_pub = """                            <div 
                                className={cn(
                                    "relative z-10 w-full mx-auto flex",
                                    effectiveSettings.contentWidth === 'full' ? "w-full px-4" : "w-full px-4",
                                    effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : effectiveSettings.columnGap === 'extended' ? 'gap-8' : effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4'
                                )}
                                style={{
                                    maxWidth: effectiveSettings.contentWidth === 'full' ? undefined : effectiveSettings.widthValue ? `${effectiveSettings.widthValue}px` : '1280px'
                                }}
                            >"""
new_inner_pub = """                            <div 
                                className={cn(
                                    "relative z-10 w-full mx-auto flex",
                                    effectiveSettings.contentWidth === 'full' ? "w-full px-4" : "w-full px-4",
                                    effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : effectiveSettings.columnGap === 'extended' ? 'gap-8' : effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4'
                                )}
                                style={{
                                    maxWidth: effectiveSettings.contentWidth === 'full' ? undefined : effectiveSettings.widthValue ? `${effectiveSettings.widthValue}px` : '1280px',
                                    justifyContent: effectiveSettings.justifyContent === 'center' ? 'center' : effectiveSettings.justifyContent === 'right' ? 'flex-end' : effectiveSettings.justifyContent === 'space-between' ? 'space-between' : effectiveSettings.justifyContent === 'space-around' ? 'space-around' : 'flex-start',
                                    alignItems: effectiveSettings.alignItems === 'middle' ? 'center' : effectiveSettings.alignItems === 'bottom' ? 'flex-end' : 'stretch'
                                }}
                            >"""
content = content.replace(old_inner_pub, new_inner_pub)

with open("src/pages/PublicPortal.tsx", "w") as f:
    f.write(content)

# 3. Update PortalBlockRenderer.tsx to remove mb-8 on header
with open("src/components/portal/PortalBlockRenderer.tsx", "r") as f:
    content = f.read()

old_header = """            {block.type === 'header' && (
                <header className={cn(
                    "w-full py-6 px-6 md:px-12 flex items-center transition-all bg-white/80 backdrop-blur-md sticky top-0 z-[100] border-b border-slate-100 rounded-[32px] mb-8 shadow-sm","""
new_header = """            {block.type === 'header' && (
                <header className={cn(
                    "w-full py-6 px-6 md:px-12 flex items-center transition-all bg-white/80 backdrop-blur-md sticky top-0 z-[100] border-b border-slate-100 rounded-[32px] shadow-sm","""
content = content.replace(old_header, new_header)

with open("src/components/portal/PortalBlockRenderer.tsx", "w") as f:
    f.write(content)

