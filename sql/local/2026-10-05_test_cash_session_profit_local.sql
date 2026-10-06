-- LOCAL ONLY: run against the local Docker PostgreSQL; all fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := '3f000000-0000-0000-0000-000000000001';
  bar uuid; mat uuid; station uuid; sid uuid; oid uuid;
  spec jsonb; result jsonb; expected numeric; profit numeric;
  mode integer; prior numeric; je_count bigint;
  wanted_profit numeric; unlinked_cases integer := 0;
begin
  if exists(select 1 from public.cash_sessions where status='open')
     or public.active_pos_operation_count() > 0 then
    raise exception 'Local fixtures require no open sessions or active orders';
  end if;
  select id into bar from public.centers where lower(trim(name))='bar principal';
  select i.material_id into mat from public.inventory i
    join public.materials m on m.id=i.material_id
    join public.categories c on c.id=m.cat_id
    where i.center_id=bar and c.is_for_sale and i.precio_venta>0 limit 1;
  select id into station from public.tables where status='libre' limit 1;
  if bar is null or mat is null or station is null then raise exception 'Missing local fixtures'; end if;
  insert into auth.users(id) values(u);
  insert into public.app_profiles(id,username,email,is_superadmin)
    values(u,'test_profit02','test_profit02@app.local',true);
  insert into public.ledger_settings(id,ledger_cutover_at,activated_by,activated_at)
    values(true,now()-interval '1 minute',u,now())
    on conflict(id) do update set ledger_cutover_at=excluded.ledger_cutover_at;
  update public.inventory set precio_venta=100,costo_promedio=60,stock_actual=1000
    where material_id=mat and center_id=bar;

  -- A-F through the authoritative multipayment backend, for each close path.
  for mode in 1..3 loop
    for spec in select value from jsonb_array_elements('[
      {"case":"A","cash":200,"pay":[{"method":"Efectivo","amount":200}]},
      {"case":"B","cash":0,"pay":[{"method":"Tarjeta","amount":200}]},
      {"case":"C","cash":120,"pay":[{"method":"Efectivo","amount":120},{"method":"Tarjeta","amount":80}]},
      {"case":"D","cash":80,"pay":[{"method":"Efectivo","amount":80},{"method":"Tarjeta","amount":120}]},
      {"case":"E","cash":100,"pay":[{"method":"Efectivo","amount":100},{"method":"Tarjeta","amount":100}]},
      {"case":"F","cash":60,"pay":[{"method":"Efectivo","amount":60},{"method":"Tarjeta","amount":80},{"method":"Transferencia","amount":60}]},
      {"case":"G","cash":0,"pay":[{"method":"Transferencia","amount":200}]},
      {"case":"H","cash":0,"pay":[{"method":"Tarjeta","amount":100},{"method":"Transferencia","amount":100}]}
    ]'::jsonb) loop
      insert into public.cash_sessions(status,opening_amount,opened_by)
        values('open',100,u) returning id into sid;
      if public.get_cash_session_profit(sid) is distinct from 0 then raise exception 'Empty session'; end if;
      oid:=gen_random_uuid();
      insert into public.table_orders(id,table_id,items,total) values(oid,station,'[]',200);
      update public.tables set status='ocupada',current_order_id=oid where id=station;
      result:=public.finalize_pos_sale(station,
        jsonb_build_array(jsonb_build_object('order_id',oid,'material_id',mat,'quantity',2)),
        spec->'pay',u,null);
      wanted_profit := 80;
      if not exists(select 1 from public.sales where cash_session_id=sid) then
        unlinked_cases := unlinked_cases + 1;
        wanted_profit := 0;
        raise warning 'INTEGRATION FAIL % close-path %: authoritative backend returned cash_session_id NULL',spec->>'case',mode;
      end if;
      profit:=public.get_cash_session_profit(sid);
      if (result->>'cash_session_id')::uuid is distinct from sid then raise exception 'Operational response'; end if;
      if (select cash_session_id from public.financial_operations where id=(result->>'financial_operation_id')::uuid)
          is distinct from (case when (spec->>'cash')::numeric>0 then sid else null end) then
        raise exception 'Financial attribution changed';
      end if;
      if (select sum(amount) from public.financial_payments where financial_operation_id=(result->>'financial_operation_id')::uuid) is distinct from 200 then
        raise exception 'Payment total changed';
      end if;
      if exists (
        select 1 from jsonb_array_elements(spec->'pay') p
        where (select sum(fp.amount) from public.financial_payments fp
          where fp.financial_operation_id=(result->>'financial_operation_id')::uuid
            and fp.payment_method=p->>'method') is distinct from (p->>'amount')::numeric
      ) then raise exception 'Payment components changed'; end if;
      if (select coalesce(sum(l.debit-l.credit),0) from public.journal_lines l
          join public.financial_accounts a on a.id=l.financial_account_id
          where l.journal_entry_id=(result->>'journal_entry_id')::uuid and a.code='1101')
          is distinct from (spec->>'cash')::numeric then raise exception '1101 posting changed'; end if;
      if (select coalesce(sum(l.debit-l.credit),0) from public.journal_lines l
          join public.financial_accounts a on a.id=l.financial_account_id
          where l.journal_entry_id=(result->>'journal_entry_id')::uuid and a.code='1103')
          is distinct from (200-(spec->>'cash')::numeric) then raise exception '1103 posting changed'; end if;
      if (select sum(debit-credit) from public.journal_lines where journal_entry_id=(result->>'journal_entry_id')::uuid)
          is distinct from 0 then raise exception 'Unbalanced posting'; end if;
      if profit is distinct from wanted_profit then raise exception '% mode % profit=%',spec->>'case',mode,profit; end if;
      select expected_cash_total into expected from public.get_cash_session_expected(sid);
      if expected is distinct from (100+(spec->>'cash')::numeric) then raise exception 'Cash changed'; end if;
      select count(*) into je_count from public.journal_entries;
      if mode=1 then
        result:=public.record_first_cash_count_atomic(sid,expected,u);
      elsif mode=2 then
        result:=public.record_first_cash_count_atomic(sid,expected-1,u);
        if result->>'close_result' <> 'difference_detected' then raise exception 'First count guard: %',result; end if;
        result:=public.submit_cash_recount_atomic(sid,expected,u);
      else
        result:=public.close_cash_session_atomic(u);
      end if;
      if (result->>'ok')::boolean is distinct from true
        or (select status from public.cash_sessions where id=sid) <> 'closed'
        or (select profit_total from public.cash_sessions where id=sid) is distinct from wanted_profit
        or (select expected_cash_total from public.cash_sessions where id=sid) is distinct from expected
        or (select count(*) from public.journal_entries) <> je_count then
        raise exception '% close mode % failed: %',spec->>'case',mode,result;
      end if;
      if wanted_profit=80 then
        raise notice 'PROFIT02 % close-path % PASS: profit 80, expected %, ledger unchanged',spec->>'case',mode,expected;
      end if;
    end loop;
  end loop;
  -- Isolated helper fixture: legacy label is irrelevant for an already-linked sale.
  -- This does NOT repair or count the unlinked backend B cases as passing.
  update public.sales set payment_method='Tarjeta' where cash_session_id=sid;
  if public.get_cash_session_profit(sid) is distinct from 80 then raise exception 'Linked card label'; end if;
  update public.sales set payment_method='Transferencia' where cash_session_id=sid;
  if public.get_cash_session_profit(sid) is distinct from 80 then raise exception 'Linked transfer label'; end if;
  -- Current-cost semantics, negative margin, zero cost, rounding; stored history unchanged.
  update public.inventory set costo_promedio=120 where material_id=mat and center_id=bar;
  if public.get_cash_session_profit(sid) is distinct from -40 then raise exception 'Negative margin'; end if;
  update public.inventory set costo_promedio=0 where material_id=mat and center_id=bar;
  if public.get_cash_session_profit(sid) is distinct from 200 then raise exception 'Zero cost'; end if;
  update public.inventory set costo_promedio=60.01 where material_id=mat and center_id=bar;
  if public.get_cash_session_profit(sid) is distinct from 79.98 then raise exception 'Decimals'; end if;
  select profit_total into prior from public.cash_sessions where id=sid;
  if prior is distinct from 80 then raise exception 'Historical value mutated'; end if;
  if public.get_cash_session_profit(gen_random_uuid()) is distinct from 0 then raise exception 'Session isolation'; end if;
  if has_function_privilege('anon','public.get_cash_session_profit(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.get_cash_session_profit(uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.get_cash_session_profit(uuid)','EXECUTE') then
    raise exception 'Helper privileges';
  end if;
  raise notice 'PROFIT02 edge cases / history / privileges PASS';
  if unlinked_cases > 0 then
    raise exception 'PROFIT02 integration blocked: % unlinked backend sales. No fixture linkage was repaired.',unlinked_cases;
  end if;
end $$;
rollback;
