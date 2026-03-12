-- SQL to measure the impact of the Base64 cleanup
-- This query counts how many records were actually modified and provides current table sizes.

WITH metrics AS (
    SELECT 
        'WhatsApp Messages (Payloads)' as category,
        count(*) as cleaned_count
    FROM public.wa_messages 
    WHERE payload_json::text LIKE '%STRIPPED_CLEANUP%'
    
    UNION ALL
    
    SELECT 
        'Trello Attachments' as category,
        count(*) as cleaned_count
    FROM public.case_attachments 
    WHERE storage_path = '[STRIPPED_INLINE_IMAGE]'
    
    UNION ALL
    
    SELECT 
        'Link Manager Photos' as category,
        count(*) as cleaned_count
    FROM public.link_manager_item_redirects 
    WHERE image_url IS NULL AND updated_at > now() - interval '1 hour' -- Assuming recently cleaned
    
    UNION ALL
    
    SELECT 
        'WhatsApp Simulator Attachments' as category,
        count(*) as cleaned_count
    FROM public.case_attachments 
    WHERE storage_path LIKE '[STRIPPED_SIMULATOR]%' OR storage_path = '[STRIPPED_INLINE_IMAGE]'
),
table_sizes AS (
    SELECT 
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as current_size
    FROM pg_catalog.pg_statio_user_tables
    WHERE relname IN ('wa_messages', 'case_attachments', 'link_manager_item_redirects')
)
SELECT 
    m.category,
    m.cleaned_count,
    ts.current_size as "current_table_size (all data)"
FROM metrics m
LEFT JOIN table_sizes ts ON (
    CASE 
        WHEN m.category = 'WhatsApp Messages (Payloads)' THEN ts.table_name = 'wa_messages'
        WHEN m.category = 'Trello Attachments' THEN ts.table_name = 'case_attachments'
        WHEN m.category = 'Link Manager Photos' THEN ts.table_name = 'link_manager_item_redirects'
        ELSE ts.table_name = 'case_attachments'
    END
);
