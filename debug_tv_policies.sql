select tablename, policyname, permissive, roles, cmd, qual, with_check 
from pg_policies 
where tablename in ('tv_timelines', 'tv_points', 'tv_media', 'tv_plans', 'tv_entity_plans');
