-- RPC to get or create a DM channel between two users (Updated with tenant_id logic)
CREATE OR REPLACE FUNCTION get_or_create_dm_channel(
    p_tenant_id UUID,
    p_user_a UUID,
    p_user_b UUID
) RETURNS UUID AS $$
DECLARE
    v_channel_id UUID;
    v_user_a_name TEXT;
    v_user_b_name TEXT;
BEGIN
    -- 1. Try to find existing DM channel
    SELECT c.id INTO v_channel_id
    FROM public.communication_channels c
    JOIN public.communication_members m1 ON m1.channel_id = c.id
    JOIN public.communication_members m2 ON m2.channel_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND c.type = 'direct'
      AND m1.user_id = p_user_a
      AND m2.user_id = p_user_b
      AND p_user_a != p_user_b
    LIMIT 1;

    -- 2. If not found, create it
    IF v_channel_id IS NULL THEN
        -- Get display names for the channel name (fallback)
        SELECT display_name INTO v_user_a_name FROM public.users_profile WHERE user_id = p_user_a AND tenant_id = p_tenant_id;
        SELECT display_name INTO v_user_b_name FROM public.users_profile WHERE user_id = p_user_b AND tenant_id = p_tenant_id;

        INSERT INTO public.communication_channels (tenant_id, name, type)
        VALUES (p_tenant_id, COALESCE(v_user_a_name, 'User') || ', ' || COALESCE(v_user_b_name, 'User'), 'direct')
        RETURNING id INTO v_channel_id;

        -- The trigger on_communication_channel_created automatically adds the creator (auth.uid() / p_user_a)
        
        -- Now manually add User B with the tenant_id
        INSERT INTO public.communication_members (channel_id, user_id, tenant_id)
        VALUES (v_channel_id, p_user_b, p_tenant_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger function also handles tenant_id correctly
create or replace function public.handle_communication_channel_creation()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.communication_members (channel_id, user_id, tenant_id)
    values (new.id, auth.uid(), new.tenant_id);
    return new;
end;
$$;
