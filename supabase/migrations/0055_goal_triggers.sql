-- Migration 0055: Goal Triggers

create table if not exists public.goal_triggers (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    event_type text not null, -- The Guardião event (e.g., from timeline_events)
    metric_key text not null, -- The Goal metric key to increment
    value_multiplier numeric not null default 1,
    created_at timestamptz not null default now(),
    created_by uuid references auth.users(id) on delete set null
);

-- Unique constraint to prevent duplicate triggers for the same event and metric
create unique index if not exists goal_triggers_tenant_event_metric_idx 
    on public.goal_triggers(tenant_id, event_type, metric_key);

alter table public.goal_triggers enable row level security;

create policy "Tenant users can view goal triggers" 
    on public.goal_triggers for select using (public.has_tenant_access(tenant_id));
create policy "Tenant admins can manage goal triggers" 
    on public.goal_triggers for all using (public.has_tenant_access(tenant_id));

-- Trigger Function to process timeline_events into incentive_events
create or replace function public.process_timeline_event_to_goals()
returns trigger as $$
declare
    v_trigger record;
    v_participant_id uuid;
    v_user_name text;
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
        -- Find or create the incentive_participant for this actor
        select id into v_participant_id 
        from public.incentive_participants 
        where tenant_id = NEW.tenant_id and user_id = NEW.actor_id 
        limit 1;

        if v_participant_id is null then
            -- Fetch user name
            select display_name into v_user_name 
            from public.users_profile 
            where id = NEW.actor_id;

            if v_user_name is null then
                v_user_name := 'Usuário Desconhecido';
            end if;

            insert into public.incentive_participants (tenant_id, user_id, name, active)
            values (NEW.tenant_id, NEW.actor_id, v_user_name, true)
            returning id into v_participant_id;
        end if;

        -- Insert the goal progress event (incentive_events)
        insert into public.incentive_events (
            tenant_id,
            participant_id,
            event_type,
            value,
            occurred_at,
            metadata
        ) values (
            NEW.tenant_id,
            v_participant_id,
            v_trigger.metric_key,
            v_trigger.value_multiplier,
            NEW.occurred_at,
            jsonb_build_object(
                'source', 'goal_trigger',
                'timeline_event_id', NEW.id,
                'original_event_type', NEW.event_type
            )
        );
    end loop;

    return NEW;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists to allow safe re-run
drop trigger if exists process_timeline_event_to_goals_trg on public.timeline_events;

-- Create the trigger
create trigger process_timeline_event_to_goals_trg
after insert on public.timeline_events
for each row
execute function public.process_timeline_event_to_goals();
