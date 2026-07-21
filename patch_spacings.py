import re

# 1. Update PortalEditor.tsx
with open("src/pages/PortalEditor.tsx", "r") as f:
    content = f.read()

# Add margins to the outer div
old_outer_div = """                )} 
                style={{ 
                    backgroundColor: section.settings?.style?.background?.color || section.settings?.backgroundColor,"""
new_outer_div = """                )} 
                style={{ 
                    marginTop: section.settings?.marginY ? `${Number(section.settings.marginY) * 4}px` : undefined,
                    marginBottom: section.settings?.marginY ? `${Number(section.settings.marginY) * 4}px` : undefined,
                    marginLeft: previewMode === 'mobile' ? undefined : section.settings?.marginX ? `${Number(section.settings.marginX) * 4}px` : undefined,
                    marginRight: previewMode === 'mobile' ? undefined : section.settings?.marginX ? `${Number(section.settings.marginX) * 4}px` : undefined,
                    backgroundColor: section.settings?.style?.background?.color || section.settings?.backgroundColor,"""
content = content.replace(old_outer_div, new_outer_div)

# Fix paddings in the inner div
old_inner_div = """                    style={{
                        paddingTop: section.settings?.paddingY ? `${section.settings.paddingY}px` : undefined,
                        paddingBottom: section.settings?.paddingY ? `${section.settings.paddingY}px` : undefined,
                        paddingLeft: previewMode === 'mobile' ? '16px' : section.settings?.paddingX ? `${section.settings.paddingX}px` : '32px',
                        paddingRight: previewMode === 'mobile' ? '16px' : section.settings?.paddingX ? `${section.settings.paddingX}px` : '32px',
                    }}"""
new_inner_div = """                    style={{
                        paddingTop: section.settings?.paddingY ? `${Number(section.settings.paddingY) * 4}px` : undefined,
                        paddingBottom: section.settings?.paddingY ? `${Number(section.settings.paddingY) * 4}px` : undefined,
                        paddingLeft: previewMode === 'mobile' ? '16px' : section.settings?.paddingX ? `${Number(section.settings.paddingX) * 4}px` : '32px',
                        paddingRight: previewMode === 'mobile' ? '16px' : section.settings?.paddingX ? `${Number(section.settings.paddingX) * 4}px` : '32px',
                    }}"""
content = content.replace(old_inner_div, new_inner_div)

with open("src/pages/PortalEditor.tsx", "w") as f:
    f.write(content)


# 2. Update PublicPortal.tsx
with open("src/pages/PublicPortal.tsx", "r") as f:
    content = f.read()

# Add margins to the outer div
old_outer_div_pub = """                )}
                style={{
                    backgroundColor: effectiveSettings.style?.background?.color || effectiveSettings.backgroundColor,"""
new_outer_div_pub = """                )}
                style={{
                    marginTop: effectiveSettings.marginY ? `${Number(effectiveSettings.marginY) * 4}px` : undefined,
                    marginBottom: effectiveSettings.marginY ? `${Number(effectiveSettings.marginY) * 4}px` : undefined,
                    marginLeft: isMobile ? undefined : effectiveSettings.marginX ? `${Number(effectiveSettings.marginX) * 4}px` : undefined,
                    marginRight: isMobile ? undefined : effectiveSettings.marginX ? `${Number(effectiveSettings.marginX) * 4}px` : undefined,
                    backgroundColor: effectiveSettings.style?.background?.color || effectiveSettings.backgroundColor,"""
content = content.replace(old_outer_div_pub, new_outer_div_pub)

# Fix paddings in the inner div
old_inner_div_pub = """                        style={{
                            paddingTop: effectiveSettings.paddingY ? `${effectiveSettings.paddingY}px` : undefined,
                            paddingBottom: effectiveSettings.paddingY ? `${effectiveSettings.paddingY}px` : undefined,
                            paddingLeft: isMobile ? '16px' : effectiveSettings.paddingX ? `${effectiveSettings.paddingX}px` : '32px',
                            paddingRight: isMobile ? '16px' : effectiveSettings.paddingX ? `${effectiveSettings.paddingX}px` : '32px',
                            justifyContent: effectiveSettings.alignItems || 'flex-start',"""
new_inner_div_pub = """                        style={{
                            paddingTop: effectiveSettings.paddingY ? `${Number(effectiveSettings.paddingY) * 4}px` : undefined,
                            paddingBottom: effectiveSettings.paddingY ? `${Number(effectiveSettings.paddingY) * 4}px` : undefined,
                            paddingLeft: isMobile ? '16px' : effectiveSettings.paddingX ? `${Number(effectiveSettings.paddingX) * 4}px` : '32px',
                            paddingRight: isMobile ? '16px' : effectiveSettings.paddingX ? `${Number(effectiveSettings.paddingX) * 4}px` : '32px',
                            justifyContent: effectiveSettings.alignItems || 'flex-start',"""
content = content.replace(old_inner_div_pub, new_inner_div_pub)

with open("src/pages/PublicPortal.tsx", "w") as f:
    f.write(content)

