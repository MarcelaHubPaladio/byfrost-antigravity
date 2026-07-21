import re

# 1. Update PortalEditor.tsx
with open("src/pages/PortalEditor.tsx", "r") as f:
    content = f.read()

old_div_editor = """                    <div className={cn("mx-auto flex", previewMode === 'mobile' ? 'w-full flex-col' : section.settings?.contentWidth === 'full' ? 'w-full px-4' : 'max-w-7xl', section.settings?.columnGap === 'no-gap' ? 'gap-0' : section.settings?.columnGap === 'extended' ? 'gap-8' : section.settings?.columnGap === 'wide' ? 'gap-12' : 'gap-4')}>"""
new_div_editor = """                    <div 
                        className={cn("mx-auto flex", previewMode === 'mobile' ? 'w-full flex-col' : section.settings?.contentWidth === 'full' ? 'w-full px-4' : 'w-full px-4', section.settings?.columnGap === 'no-gap' ? 'gap-0' : section.settings?.columnGap === 'extended' ? 'gap-8' : section.settings?.columnGap === 'wide' ? 'gap-12' : 'gap-4')}
                        style={{
                            maxWidth: section.settings?.contentWidth === 'full' ? undefined : section.settings?.widthValue ? `${section.settings.widthValue}px` : '1280px'
                        }}
                    >"""
content = content.replace(old_div_editor, new_div_editor)

with open("src/pages/PortalEditor.tsx", "w") as f:
    f.write(content)

# 2. Update PublicPortal.tsx
with open("src/pages/PublicPortal.tsx", "r") as f:
    content = f.read()

old_div_public_1 = """                        <div className={cn("mx-auto flex", isMobile ? 'w-full flex-col' : effectiveSettings.contentWidth === 'full' ? 'w-full px-4' : 'max-w-7xl', effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : effectiveSettings.columnGap === 'extended' ? 'gap-8' : effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4')}>"""
new_div_public_1 = """                        <div 
                            className={cn("mx-auto flex", isMobile ? 'w-full flex-col' : effectiveSettings.contentWidth === 'full' ? 'w-full px-4' : 'w-full px-4', effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : effectiveSettings.columnGap === 'extended' ? 'gap-8' : effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4')}
                            style={{
                                maxWidth: effectiveSettings.contentWidth === 'full' ? undefined : effectiveSettings.widthValue ? `${effectiveSettings.widthValue}px` : '1280px'
                            }}
                        >"""
content = content.replace(old_div_public_1, new_div_public_1)

old_div_public_2 = """                            <div className={cn("mx-auto flex w-full",
                                isMobile ? 'flex-col' : 'flex-row',
                                effectiveSettings.contentWidth === 'full' ? "w-full px-4" : "max-w-7xl",
                                effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : 
                                effectiveSettings.columnGap === 'extended' ? 'gap-8' : 
                                effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4'
                            )}>"""

new_div_public_2 = """                            <div 
                                className={cn("mx-auto flex w-full px-4",
                                    isMobile ? 'flex-col' : 'flex-row',
                                    effectiveSettings.columnGap === 'no-gap' ? 'gap-0' : 
                                    effectiveSettings.columnGap === 'extended' ? 'gap-8' : 
                                    effectiveSettings.columnGap === 'wide' ? 'gap-12' : 'gap-4'
                                )}
                                style={{
                                    maxWidth: effectiveSettings.contentWidth === 'full' ? undefined : effectiveSettings.widthValue ? `${effectiveSettings.widthValue}px` : '1280px'
                                }}
                            >"""

content = content.replace(old_div_public_2, new_div_public_2)

with open("src/pages/PublicPortal.tsx", "w") as f:
    f.write(content)

