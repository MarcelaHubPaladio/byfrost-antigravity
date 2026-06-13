-- 0056_inventory_triggers.sql

-- Helper function to adjust inventory for a given product
create or replace function public.fn_adjust_inventory(
  p_tenant_id uuid,
  p_product_id uuid,
  p_config_id text,
  p_diff numeric, -- Positive diff means we consume stock (subtract). Negative diff means we return stock (add).
  p_reason text,
  p_case_id uuid,
  p_actor_id uuid
) returns void as $$
declare
  v_metadata jsonb;
  v_allow_out_of_stock boolean;
  v_old_loja numeric;
  v_old_consignado numeric;
  v_old_total numeric;
  v_new_loja numeric;
  v_new_consignado numeric;
  v_new_total numeric;
  v_config_name text := '';
  v_display_name text;
  v_new_metadata jsonb;
  v_updated_configs jsonb;
  v_found_config boolean := false;
begin
  if p_product_id is null then return; end if;
  if p_diff = 0 then return; end if;

  select metadata, display_name
    into v_metadata, v_display_name
    from public.core_entities
   where id = p_product_id
     for update; -- Lock the row

  if not found then return; end if;

  v_allow_out_of_stock := coalesce((v_metadata->>'allow_out_of_stock_sales')::boolean, false);

  if p_config_id is not null and v_metadata->'configurations' is not null and jsonb_typeof(v_metadata->'configurations') = 'array' then
    -- It's a configured product
    select jsonb_agg(
             case when (elem->>'id') = p_config_id then
               jsonb_set(
                 jsonb_set(elem, '{estoque_loja}', to_jsonb(coalesce((elem->>'estoque_loja')::numeric, 0) - p_diff)),
                 '{estoque_total}', to_jsonb(coalesce((elem->>'estoque_total')::numeric, 0) - p_diff)
               )
             else elem end
           )
      into v_updated_configs
      from jsonb_array_elements(v_metadata->'configurations') as elem;

    -- Extract old values and check out of stock
    select coalesce((elem->>'estoque_loja')::numeric, 0),
           coalesce((elem->>'estoque_consignado')::numeric, 0),
           coalesce((elem->>'estoque_total')::numeric, 0),
           elem->>'name'
      into v_old_loja, v_old_consignado, v_old_total, v_config_name
      from jsonb_array_elements(v_metadata->'configurations') as elem
     where (elem->>'id') = p_config_id;

    if v_config_name is null then
      v_config_name := p_config_id;
    else
      v_found_config := true;
    end if;

    if v_found_config then
      v_new_loja := v_old_loja - p_diff;
      v_new_consignado := v_old_consignado;
      v_new_total := v_new_loja + v_new_consignado;

      if not v_allow_out_of_stock and v_new_loja < 0 and p_diff > 0 then
        raise exception 'Estoque insuficiente para a variação "%" do produto "%". Disponível na loja: %, Solicitado: %', v_config_name, v_display_name, v_old_loja, p_diff;
      end if;

      v_new_metadata := jsonb_set(v_metadata, '{configurations}', coalesce(v_updated_configs, '[]'::jsonb));
    else
      -- Config not found, fallback to basic metadata
      v_new_metadata := v_metadata;
    end if;

  else
    -- Base product
    v_old_loja := coalesce((v_metadata->>'estoque_loja')::numeric, 0);
    v_old_consignado := coalesce((v_metadata->>'estoque_consignado')::numeric, 0);
    v_old_total := coalesce((v_metadata->>'estoque_total')::numeric, 0);

    v_new_loja := v_old_loja - p_diff;
    v_new_consignado := v_old_consignado;
    v_new_total := v_new_loja + v_new_consignado;

    if not v_allow_out_of_stock and v_new_loja < 0 and p_diff > 0 then
      raise exception 'Estoque insuficiente para o produto "%". Disponível na loja: %, Solicitado: %', v_display_name, v_old_loja, p_diff;
    end if;

    v_new_metadata := jsonb_set(
                        jsonb_set(v_metadata, '{estoque_loja}', to_jsonb(v_new_loja)),
                        '{estoque_total}', to_jsonb(v_new_total)
                      );
  end if;

  -- Update metadata
  if v_new_metadata is distinct from v_metadata then
    update public.core_entities
       set metadata = v_new_metadata
     where id = p_product_id;

    -- Insert core_entity_events
    insert into public.core_entity_events (
      tenant_id,
      entity_id,
      event_type,
      before,
      after,
      actor_user_id,
      created_at
    ) values (
      p_tenant_id,
      p_product_id,
      'stock_change',
      jsonb_build_object(
        'estoque_loja', v_old_loja,
        'estoque_consignado', v_old_consignado,
        'estoque_total', v_old_total,
        'config_id', p_config_id,
        'config_name', v_config_name
      ),
      jsonb_build_object(
        'estoque_loja', v_new_loja,
        'estoque_consignado', v_new_consignado,
        'estoque_total', v_new_total,
        'config_id', p_config_id,
        'config_name', v_config_name,
        'change_qty', -p_diff, -- Negative means we removed stock
        'reason', p_reason,
        'case_id', p_case_id
      ),
      p_actor_id,
      now()
    );
  end if;
end;
$$ language plpgsql;


-- Trigger on case_items
create or replace function public.trg_case_items_inventory_sync_fn() returns trigger as $$
declare
  v_case_state text;
  v_diff numeric := 0;
  v_reason text := '';
  v_actor_id uuid;
begin
  -- Skip inventory logic if the order is already cancelled
  if TG_OP = 'INSERT' then
    select state into v_case_state from public.cases where id = new.case_id;
    if lower(v_case_state) in ('cancelled', 'cancelado') then return new; end if;

    v_diff := coalesce(new.qty, 0);
    v_reason := 'Reserva de estoque para pedido';
    
    -- In postgres triggers, we don't naturally have session user ID unless auth.uid() works
    begin v_actor_id := auth.uid(); exception when others then v_actor_id := null; end;

    perform public.fn_adjust_inventory(
      new.tenant_id,
      new.offering_entity_id,
      new.confidence_json->>'config_id',
      v_diff,
      v_reason,
      new.case_id,
      v_actor_id
    );

  elsif TG_OP = 'UPDATE' then
    select state into v_case_state from public.cases where id = new.case_id;
    if lower(v_case_state) in ('cancelled', 'cancelado') then return new; end if;

    -- If product changed or qty changed
    if new.offering_entity_id is distinct from old.offering_entity_id or
       (new.confidence_json->>'config_id') is distinct from (old.confidence_json->>'config_id') then
      
      -- Revert old stock
      begin v_actor_id := auth.uid(); exception when others then v_actor_id := null; end;

      perform public.fn_adjust_inventory(
        old.tenant_id,
        old.offering_entity_id,
        old.confidence_json->>'config_id',
        -coalesce(old.qty, 0), -- Return stock
        'Remoção/Troca de produto no pedido',
        old.case_id,
        v_actor_id
      );

      -- Deduct new stock
      perform public.fn_adjust_inventory(
        new.tenant_id,
        new.offering_entity_id,
        new.confidence_json->>'config_id',
        coalesce(new.qty, 0),
        'Nova reserva de produto no pedido',
        new.case_id,
        v_actor_id
      );

    else
      -- Just qty changed
      v_diff := coalesce(new.qty, 0) - coalesce(old.qty, 0);
      if v_diff <> 0 then
        begin v_actor_id := auth.uid(); exception when others then v_actor_id := null; end;
        perform public.fn_adjust_inventory(
          new.tenant_id,
          new.offering_entity_id,
          new.confidence_json->>'config_id',
          v_diff,
          case when v_diff > 0 then 'Aumento de quantidade no pedido' else 'Redução de quantidade no pedido' end,
          new.case_id,
          v_actor_id
        );
      end if;
    end if;

  elsif TG_OP = 'DELETE' then
    select state into v_case_state from public.cases where id = old.case_id;
    if lower(v_case_state) in ('cancelled', 'cancelado') then return old; end if;

    begin v_actor_id := auth.uid(); exception when others then v_actor_id := null; end;

    perform public.fn_adjust_inventory(
      old.tenant_id,
      old.offering_entity_id,
      old.confidence_json->>'config_id',
      -coalesce(old.qty, 0), -- Return stock
      'Remoção de produto do pedido',
      old.case_id,
      v_actor_id
    );
    return old;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_case_items_inventory_sync on public.case_items;
create trigger trg_case_items_inventory_sync
after insert or update of offering_entity_id, qty, confidence_json or delete on public.case_items
for each row execute function public.trg_case_items_inventory_sync_fn();


-- Trigger on cases
create or replace function public.trg_cases_inventory_status_sync_fn() returns trigger as $$
declare
  v_old_cancelled boolean;
  v_new_cancelled boolean;
  v_item record;
  v_actor_id uuid;
begin
  v_old_cancelled := lower(coalesce(old.state, '')) in ('cancelled', 'cancelado');
  v_new_cancelled := lower(coalesce(new.state, '')) in ('cancelled', 'cancelado');

  if v_old_cancelled = v_new_cancelled then
    return new;
  end if;

  begin v_actor_id := auth.uid(); exception when others then v_actor_id := null; end;

  if v_new_cancelled then
    -- Transitioning TO cancelled: return stock
    for v_item in (select * from public.case_items where case_id = new.id) loop
      perform public.fn_adjust_inventory(
        v_item.tenant_id,
        v_item.offering_entity_id,
        v_item.confidence_json->>'config_id',
        -coalesce(v_item.qty, 0),
        'Pedido Cancelado - Devolução',
        new.id,
        v_actor_id
      );
    end loop;
  elsif v_old_cancelled then
    -- Transitioning FROM cancelled: reserve stock again
    for v_item in (select * from public.case_items where case_id = new.id) loop
      perform public.fn_adjust_inventory(
        v_item.tenant_id,
        v_item.offering_entity_id,
        v_item.confidence_json->>'config_id',
        coalesce(v_item.qty, 0),
        'Pedido Reaberto - Reserva',
        new.id,
        v_actor_id
      );
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_cases_inventory_status_sync on public.cases;
create trigger trg_cases_inventory_status_sync
after update of state on public.cases
for each row execute function public.trg_cases_inventory_status_sync_fn();

