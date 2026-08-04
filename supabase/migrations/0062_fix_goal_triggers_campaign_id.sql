-- Migration 0062: Fix Goal Triggers campaign_id constraint

create or replace function public.process_timeline_event_to_goals()
returns trigger as $$
declare
    v_trigger record;
    v_participant_id uuid;
    v_user_name text;
    v_case_journey_id uuid;
    v_campaign_id uuid;
begin
    -- Only process events with an actor
    if NEW.actor_id is null then
        return NEW;
    end if;

    -- Look for configured triggers for this event type
    for v_trigger in 
        select * from public.goal_triggers 
        where tenant_id = NEW.tenant_id 
          and event_type = NEW.event_type
    loop
        -- If the trigger is restricted to a specific journey, we must verify the case's journey
        if v_trigger.filter_journey_id is not null then
            if NEW.case_id is null then
                -- Event has no case, so it can't belong to the required journey
                continue;
            end if;

            select journey_id into v_case_journey_id 
            from public.cases 
            where id = NEW.case_id;

            if v_case_journey_id is null or v_case_journey_id != v_trigger.filter_journey_id then
                -- Does not match the journey filter
                continue;
            end if;
        end if;

        -- Find or create the incentive_participant for this actor
        select id into v_participant_id 
        from public.incentive_participants 
        where tenant_id = NEW.tenant_id and user_id = NEW.actor_id 
        limit 1;

        if v_participant_id is null then
            -- Fetch user name using user_id instead of id
            select display_name into v_user_name 
            from public.users_profile 
            where user_id = NEW.actor_id;

            if v_user_name is null then
                v_user_name := 'Usuário Desconhecido';
            end if;

            insert into public.incentive_participants (tenant_id, user_id, name, active, cpf, whatsapp)
            values (NEW.tenant_id, NEW.actor_id, v_user_name, true, 'N/A-' || NEW.actor_id, 'N/A-' || NEW.actor_id)
            returning id into v_participant_id;
        end if;

        -- Find or create a global campaign for Goal Triggers
        select id into v_campaign_id
        from public.campaigns
        where tenant_id = NEW.tenant_id
        order by created_at desc
        limit 1;

        if v_campaign_id is null then
            insert into public.campaigns (
                tenant_id, name, participant_scope, ranking_type, visibility, start_date, end_date, status
            ) values (
                NEW.tenant_id, 'Global Goals Campaign', 'all', 'points', 'public', current_date, current_date + interval '10 years', 'active'
            ) returning id into v_campaign_id;
        end if;

        -- Insert the goal progress event
        insert into public.incentive_events (
            tenant_id,
            campaign_id,
            participant_id,
            event_type,
            value,
            created_at,
            metadata
        ) values (
            NEW.tenant_id,
            v_campaign_id,
            v_participant_id,
            v_trigger.metric_key,
            v_trigger.value_multiplier,
            coalesce(NEW.occurred_at, NEW.created_at, now()),
            jsonb_build_object(
                'source', 'goal_trigger',
                'timeline_event_id', NEW.id,
                'original_event_type', NEW.event_type,
                'filtered_journey_id', v_trigger.filter_journey_id
            )
        );
    end loop;

    return NEW;
end;
$$ language plpgsql security definer;
