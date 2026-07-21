import re

with open("src/components/portal/AgroForteRenderer.tsx", "r") as f:
    content = f.read()

old_block = """    let layoutClasses = '';
    if (layout.contentWidth === 'boxed') {
        layoutClasses += ' mx-auto'; // Center the boxed content
    }
    if (layout.height === 'screen') layoutClasses += ' min-h-screen';
    if (layout.height === 'min') layoutClasses += ' min-h-[400px]';
    
    if (layout.verticalAlign === 'top') layoutClasses += ' flex flex-col justify-start';
    if (layout.verticalAlign === 'middle') layoutClasses += ' flex flex-col justify-center';
    if (layout.verticalAlign === 'bottom') layoutClasses += ' flex flex-col justify-end';
    if (layout.verticalAlign === 'space-between') layoutClasses += ' flex flex-col justify-between';
    
    if (layout.overflow === 'hidden') layoutClasses += ' overflow-hidden';
    if (layout.overflow === 'auto') layoutClasses += ' overflow-auto';
    
    if (layout.stretchSection) layoutClasses += ' w-full max-w-none';
    
    const combinedClassName = editMode ? cn("afr-editable", className, layoutClasses) : cn(className, layoutClasses);
    
    let combinedStyle = { ...style };
    if (layout.contentWidth === 'boxed' && !layout.stretchSection) {
        combinedStyle.maxWidth = layout.widthValue ? `${layout.widthValue}px` : '1200px';
        combinedStyle.width = '100%';
        combinedStyle.margin = '0 auto';
    }"""

new_block = """    let layoutClasses = '';
    if (layout.contentWidth === 'boxed') {
        layoutClasses += ' mx-auto'; // Center the boxed content
    }
    if (layout.height === 'screen') layoutClasses += ' min-h-screen';
    if (layout.height === 'min') layoutClasses += ' min-h-[400px]';
    
    if (layout.verticalAlign === 'top') layoutClasses += ' flex flex-col justify-start';
    if (layout.verticalAlign === 'middle') layoutClasses += ' flex flex-col justify-center';
    if (layout.verticalAlign === 'bottom') layoutClasses += ' flex flex-col justify-end';
    if (layout.verticalAlign === 'space-between') layoutClasses += ' flex flex-col justify-between';
    
    if (layout.overflow === 'hidden') layoutClasses += ' overflow-hidden';
    if (layout.overflow === 'auto') layoutClasses += ' overflow-auto';
    
    if (layout.stretchSection) layoutClasses += ' w-full max-w-none';
    
    if (layout.sticky === 'top') layoutClasses += ' sticky top-0 z-50';
    if (layout.sticky === 'bottom') layoutClasses += ' sticky bottom-0 z-50';
    if (layout.animation && layout.animation !== 'padrao' && layout.animation !== 'none') layoutClasses += ` animate-${layout.animation}`;
    
    const combinedClassName = editMode ? cn("afr-editable", className, layoutClasses) : cn(className, layoutClasses);
    
    let combinedStyle = { ...style };
    if (layout.contentWidth === 'boxed' && !layout.stretchSection) {
        combinedStyle.maxWidth = layout.widthValue ? `${layout.widthValue}px` : '1200px';
        combinedStyle.width = '100%';
        combinedStyle.margin = '0 auto';
    }
    if (layout.paddingY) {
        combinedStyle.paddingTop = `${Number(layout.paddingY) * 4}px`;
        combinedStyle.paddingBottom = `${Number(layout.paddingY) * 4}px`;
    }
    if (layout.paddingX) {
        combinedStyle.paddingLeft = `${Number(layout.paddingX) * 4}px`;
        combinedStyle.paddingRight = `${Number(layout.paddingX) * 4}px`;
    }
    if (layout.marginY) {
        combinedStyle.marginTop = `${Number(layout.marginY) * 4}px`;
        combinedStyle.marginBottom = `${Number(layout.marginY) * 4}px`;
    }
    if (layout.marginX) {
        combinedStyle.marginLeft = `${Number(layout.marginX) * 4}px`;
        combinedStyle.marginRight = `${Number(layout.marginX) * 4}px`;
    }"""

content = content.replace(old_block, new_block)

with open("src/components/portal/AgroForteRenderer.tsx", "w") as f:
    f.write(content)

