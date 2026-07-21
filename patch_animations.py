import re

# 1. Update AgroForteRenderer.tsx
with open("src/components/portal/AgroForteRenderer.tsx", "r") as f:
    content = f.read()

old_anim = """    if (layout.sticky === 'top') layoutClasses += ' sticky top-0 z-50';
    if (layout.sticky === 'bottom') layoutClasses += ' sticky bottom-0 z-50';
    if (layout.animation && layout.animation !== 'padrao' && layout.animation !== 'none') layoutClasses += ` animate-${layout.animation}`;"""

new_anim = """    if (layout.sticky === 'top') layoutClasses += ' sticky top-0 z-50';
    if (layout.sticky === 'bottom') layoutClasses += ' sticky bottom-0 z-50';
    if (layout.animation && layout.animation !== 'padrao' && layout.animation !== 'none') {
        if (layout.animation === 'fade-in') layoutClasses += ' animate-in fade-in duration-700';
        if (layout.animation === 'fade-up') layoutClasses += ' animate-in fade-in slide-in-from-bottom-8 duration-700';
        if (layout.animation === 'zoom-in') layoutClasses += ' animate-in zoom-in duration-700';
    }"""
content = content.replace(old_anim, new_anim)

with open("src/components/portal/AgroForteRenderer.tsx", "w") as f:
    f.write(content)

# 2. Update PortalEditor.tsx
with open("src/pages/PortalEditor.tsx", "r") as f:
    content = f.read()

old_portal = """            <div 
                ref={setNodeRef}
                className={cn(
                    "relative group",
                    active?.id === section.id && "opacity-50"
                )}"""
new_portal = """            <div 
                ref={setNodeRef}
                className={cn(
                    "relative group transition-all",
                    active?.id === section.id && "opacity-50",
                    section.settings?.sticky === 'top' && "sticky top-0 z-50",
                    section.settings?.sticky === 'bottom' && "sticky bottom-0 z-50",
                    section.settings?.animation === 'fade-in' && "animate-in fade-in duration-700",
                    section.settings?.animation === 'fade-up' && "animate-in fade-in slide-in-from-bottom-8 duration-700",
                    section.settings?.animation === 'zoom-in' && "animate-in zoom-in duration-700"
                )}"""
content = content.replace(old_portal, new_portal)
with open("src/pages/PortalEditor.tsx", "w") as f:
    f.write(content)


# 3. Update PublicPortal.tsx
with open("src/pages/PublicPortal.tsx", "r") as f:
    content = f.read()

old_public = """                        <section 
                            key={section.id} 
                            className={cn(
                                "relative w-full overflow-hidden transition-all duration-700",
                                effectiveSettings.height === 'fit-screen' ? "min-h-screen" : effectiveSettings.height === 'min-height' ? "min-h-[500px]" : "min-h-0",
                                "flex flex-col",
                                effectiveSettings.htmlTag || ''
                            )}"""
new_public = """                        <section 
                            key={section.id} 
                            className={cn(
                                "relative w-full overflow-hidden transition-all duration-700",
                                effectiveSettings.height === 'fit-screen' ? "min-h-screen" : effectiveSettings.height === 'min-height' ? "min-h-[500px]" : "min-h-0",
                                "flex flex-col",
                                effectiveSettings.htmlTag || '',
                                effectiveSettings.sticky === 'top' && "sticky top-0 z-50",
                                effectiveSettings.sticky === 'bottom' && "sticky bottom-0 z-50",
                                effectiveSettings.animation === 'fade-in' && "animate-in fade-in duration-700",
                                effectiveSettings.animation === 'fade-up' && "animate-in fade-in slide-in-from-bottom-8 duration-700",
                                effectiveSettings.animation === 'zoom-in' && "animate-in zoom-in duration-700"
                            )}"""
content = content.replace(old_public, new_public)
with open("src/pages/PublicPortal.tsx", "w") as f:
    f.write(content)

