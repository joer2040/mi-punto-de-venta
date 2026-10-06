-- PROFIT-02B DEV fixture. Single statement; ends with a deliberate exception so every row rolls back.
do $$
declare
  u uuid := gen_random_uuid();
  bar uuid; mat uuid; station uuid; sid uuid; oid uuid;
  spec jsonb; result jsonb; expected numeric; live numeric; mode integer;
  je_count bigint; n_sales bigint; n_je bigint; stock numeric; hist text;
  log text := '';
begin
  if exists(select 1 from public.cash_sessions where status='open') or public.active_pos_operation_count() > 0 then
    raise exception 'FIXTURE_PRECONDITION: open session or active orders';
  end if;
  if (select ledger_cutover_at from public.ledger_settings where id) is null
     or (select ledger_cutover_at from public.ledger_settings where id) > now() then
    raise exception 'FIXTURE_PRECONDITION: ledger not active';
  end if;
  select md5(string_agg(id::text||':'||profit_total::text, ',' order by id)) into hist
    from public.cash_sessions where status<>'open';
  select id into bar from public.centers where lower(trim(name))='bar principal';
  select i.material_id into mat from public.inventory i
    join public.materials m on m.id=i.material_id join public.categories c on c.id=m.cat_id
    where i.center_id=bar and c.is_for_sale and i.precio_venta>0 limit 1;
  select id into station from public.tables where status='libre' limit 1;
  if bar is null or mat is null or station is null then raise exception 'FIXTURE_PRECONDITION: fixtures'; end if;
  insert into auth.users(id) values(u);
  insert into public.app_profiles(id,username,email,is_superadmin) values(u,'test_profit02b','test_profit02b@app.local',true);
  update public.inventory set precio_venta=100,costo_promedio=60,stock_actual=1000 where material_id=mat and center_id=bar;

  -- Guard 1: no open session -> rejected, no side effects
  -- Residual order is created while a temporary session is open (POS triggers require it),
  -- then the session is deleted: same adversarial setup as PROFIT-02A.2 local runner.
  insert into public.cash_sessions(status,opening_amount,opened_by) values('open',100,u) returning id into sid;
  oid:=gen_random_uuid();
  insert into public.table_orders(id,table_id,items,total) values(oid,station,'[]',200);
  update public.tables set status='ocupada',current_order_id=oid where id=station;
  delete from public.cash_sessions where id=sid;
  select count(*) into n_sales from public.sales; select count(*) into n_je from public.journal_entries;
  select stock_actual into stock from public.inventory where material_id=mat and center_id=bar;
  begin
    perform public.finalize_pos_sale(station, jsonb_build_array(jsonb_build_object('order_id',oid,'material_id',mat,'quantity',2)),
      '[{"method":"Tarjeta","amount":200}]', u, null);
    raise exception 'GUARD_NOT_TRIGGERED';
  exception when others then
    if sqlerrm not like '%No hay una caja abierta%' then raise exception 'G1 wrong error: %', sqlerrm; end if;
  end;
  if (select count(*) from public.sales)<>n_sales or (select count(*) from public.journal_entries)<>n_je
     or (select stock_actual from public.inventory where material_id=mat and center_id=bar)<>stock then
    raise exception 'G1 side effects';
  end if;
  log := log || 'G1 no-session PASS; ';

  -- Guard 2: counted session -> rejected, no side effects
  insert into public.cash_sessions(status,opening_amount,opened_by,first_counted_cash) values('open',100,u,99) returning id into sid;
  begin
    perform public.finalize_pos_sale(station, jsonb_build_array(jsonb_build_object('order_id',oid,'material_id',mat,'quantity',2)),
      '[{"method":"Efectivo","amount":200}]', u, null);
    raise exception 'GUARD_NOT_TRIGGERED';
  exception when others then
    if sqlerrm not like '%proceso de cierre%' then raise exception 'G2 wrong error: %', sqlerrm; end if;
  end;
  if (select count(*) from public.sales)<>n_sales or (select count(*) from public.journal_entries)<>n_je then
    raise exception 'G2 side effects';
  end if;
  delete from public.cash_sessions where id=sid;
  update public.tables set status='libre',current_order_id=null where id=station;
  delete from public.table_orders where id=oid;
  log := log || 'G2 counted-session PASS; ';

  -- A-H x 3 close paths (1 first count exact, 2 first count diff + recount, 3 legacy close)
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
      insert into public.cash_sessions(status,opening_amount,opened_by) values('open',100,u) returning id into sid;
      if public.get_cash_session_profit(sid) is distinct from 0 then raise exception 'empty session profit'; end if;
      oid:=gen_random_uuid();
      insert into public.table_orders(id,table_id,items,total) values(oid,station,'[]',200);
      update public.tables set status='ocupada',current_order_id=oid where id=station;
      result:=public.finalize_pos_sale(station, jsonb_build_array(jsonb_build_object('order_id',oid,'material_id',mat,'quantity',2)), spec->'pay',u,null);
      if (select cash_session_id from public.sales where id=(result->>'id')::uuid) is distinct from sid then
        raise exception '% m% sales.cash_session_id not operational', spec->>'case', mode; end if;
      if (select cash_session_id from public.financial_operations where id=(result->>'financial_operation_id')::uuid)
         is distinct from (case when (spec->>'cash')::numeric>0 then sid else null end) then
        raise exception '% m% financial link wrong', spec->>'case', mode; end if;
      if exists (select 1 from jsonb_array_elements(spec->'pay') p
        where (select sum(fp.amount) from public.financial_payments fp
               where fp.financial_operation_id=(result->>'financial_operation_id')::uuid and fp.payment_method=p->>'method')
              is distinct from (p->>'amount')::numeric) then raise exception '% payment components', spec->>'case'; end if;
      if (select coalesce(sum(l.debit-l.credit),0) from public.journal_lines l join public.financial_accounts a on a.id=l.financial_account_id
          where l.journal_entry_id=(result->>'journal_entry_id')::uuid and a.code='1101') is distinct from (spec->>'cash')::numeric
        then raise exception '% 1101 posting', spec->>'case'; end if;
      if (select coalesce(sum(l.debit-l.credit),0) from public.journal_lines l join public.financial_accounts a on a.id=l.financial_account_id
          where l.journal_entry_id=(result->>'journal_entry_id')::uuid and a.code='1103') is distinct from 200-(spec->>'cash')::numeric
        then raise exception '% 1103 posting', spec->>'case'; end if;
      if (select sum(debit-credit) from public.journal_lines where journal_entry_id=(result->>'journal_entry_id')::uuid) <> 0
        then raise exception '% unbalanced', spec->>'case'; end if;
      live := public.get_cash_session_profit(sid);
      if live is distinct from 80 then raise exception '% m% live profit=%', spec->>'case', mode, live; end if;
      select expected_cash_total into expected from public.get_cash_session_expected(sid);
      if expected is distinct from 100+(spec->>'cash')::numeric then raise exception '% expected=%', spec->>'case', expected; end if;
      select count(*) into je_count from public.journal_entries;
      if mode=1 then
        result:=public.record_first_cash_count_atomic(sid,expected,u);
      elsif mode=2 then
        result:=public.record_first_cash_count_atomic(sid,expected-1,u);
        if result->>'close_result' <> 'difference_detected' then raise exception 'first count diff: %', result; end if;
        if (select expected_cash_total from public.get_cash_session_expected(sid)) is distinct from expected then raise exception 'freeze'; end if;
        result:=public.submit_cash_recount_atomic(sid,expected,u);
      else
        result:=public.close_cash_session_atomic(u);
      end if;
      if (result->>'ok')::boolean is distinct from true
         or (select status from public.cash_sessions where id=sid) <> 'closed'
         or (select profit_total from public.cash_sessions where id=sid) is distinct from live
         or (select expected_cash_total from public.cash_sessions where id=sid) is distinct from expected
         or (select count(*) from public.journal_entries) <> je_count then
        raise exception '% close mode % failed: %', spec->>'case', mode, result;
      end if;
    end loop;
    log := log || 'A-H mode'||mode||' 8/8 PASS; ';
  end loop;

  -- Historical sessions untouched by the fixture flows
  if (select md5(string_agg(id::text||':'||profit_total::text, ',' order by id)) from public.cash_sessions
      where status<>'open' and opened_by<>u) is distinct from hist then raise exception 'historical modified'; end if;
  log := log || 'history PASS; ';
  if (select count(*) from (select journal_entry_id from public.journal_lines group by 1 having sum(debit)<>sum(credit)) x) > 0
    then raise exception 'ledger unbalanced'; end if;
  log := log || 'ledger balanced PASS';

  raise exception 'PROFIT02B_DEV_FIXTURE_OK | %', log;
end $$;
