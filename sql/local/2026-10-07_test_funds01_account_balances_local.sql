-- LOCAL ONLY: FUNDS-01B get_account_balances (status + p_as_of). All fixtures roll back.
-- Uses isolated T9xx accounts so assertions are exact regardless of existing local data.
\set ON_ERROR_STOP on
begin;

create function pg_temp.post(p_no text, p_status text, p_at timestamptz,
                             p_dr uuid, p_cr uuid, p_amt numeric, p_by uuid)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.journal_entries(entry_number, entry_type, status, occurred_at, created_by)
    values (p_no, 'transfer', 'pending', p_at, p_by) returning id into v;
  insert into public.journal_lines(journal_entry_id, financial_account_id, debit, credit)
    values (v, p_dr, p_amt, 0), (v, p_cr, 0, p_amt);
  if p_status = 'confirmed' then
    update public.journal_entries set status = 'confirmed' where id = v;
  end if;
  return v;
end $$;

create function pg_temp.bal(p_code text, p_as_of timestamptz default null)
returns table(d numeric, c numeric, b numeric) language sql as $$
  select total_debit, total_credit, balance
  from public.get_account_balances(p_as_of) where code = p_code
$$;

do $$
declare
  u1 uuid := 'f0010000-0000-0000-0000-000000000001';
  u2 uuid := 'f0010000-0000-0000-0000-000000000002';
  t1 timestamptz := '2026-01-10 12:00:00+00';
  t2 timestamptz := '2026-01-20 12:00:00+00';
  a uuid; i uuid; r uuid; q uuid; s uuid; se uuid; z uuid;
  e_rev uuid; r_ text; n bigint;
  d numeric; c numeric; b numeric;
begin
  insert into auth.users(id) values (u1), (u2);
  insert into public.app_profiles(id, username, email, is_superadmin) values
    (u1, 'test_funds01_a', 'test_funds01_a@app.local', true),
    (u2, 'test_funds01_b', 'test_funds01_b@app.local', true);

  insert into public.financial_accounts(code, name, account_type) values
    ('T901', 'FUNDS01 asset',        'asset')   returning id into a;
  insert into public.financial_accounts(code, name, account_type) values
    ('T902', 'FUNDS01 income',       'income')  returning id into i;
  insert into public.financial_accounts(code, name, account_type) values
    ('T903', 'FUNDS01 asset rev',    'asset')   returning id into r;
  insert into public.financial_accounts(code, name, account_type) values
    ('T904', 'FUNDS01 equity rev',   'equity')  returning id into q;
  insert into public.financial_accounts(code, name, account_type) values
    ('T905', 'FUNDS01 asset as-of',  'asset')   returning id into s;
  insert into public.financial_accounts(code, name, account_type) values
    ('T906', 'FUNDS01 equity as-of', 'equity')  returning id into se;
  insert into public.financial_accounts(code, name, account_type) values
    ('T907', 'FUNDS01 zero',         'asset')   returning id into z;

  perform pg_temp.post('JE-F01-1', 'confirmed', t1, a, i, 100, u1);  -- Dr asset 100 / Cr income 100
  perform pg_temp.post('JE-F01-2', 'confirmed', t1, i, a,  30, u1);  -- Dr income 30 / Cr asset 30
  perform pg_temp.post('JE-F01-3', 'pending',   t1, z, i, 999, u1);  -- pending: must not count
  e_rev := pg_temp.post('JE-F01-4', 'confirmed', t1, r, q, 200, u1);
  perform public.reverse_journal_entry(e_rev, u2, 'FUNDS-01B test', u1, null);
  perform pg_temp.post('JE-F01-5', 'confirmed', t2, s, se, 50, u1);

  -- B1 current confirmed
  select * into d, c, b from pg_temp.bal('T901');
  if (d, c) is distinct from (100.00, 30.00) then
    raise exception 'B1 FAIL T901 debit/credit=%/% (expected 100/30)', d, c;
  end if;
  raise notice 'B1 PASS current confirmed: T901 Dr=% Cr=%', d, c;

  -- B2 pending exclusion (pending 999 on T907 and T902)
  select * into d, c, b from pg_temp.bal('T902');
  if c is distinct from 100.00 then raise exception 'B2 FAIL T902 credit=% includes pending', c; end if;
  select * into d, c, b from pg_temp.bal('T907');
  if d is distinct from 0 then raise exception 'B2 FAIL T907 debit=% includes pending', d; end if;
  raise notice 'B2 PASS pending contributes 0';

  -- B3 reversed: original (reversed) + mirror (confirmed) net 0
  select status into r_ from public.journal_entries where id = e_rev;
  if r_ <> 'reversed' then raise exception 'B3 SETUP original status=%', r_; end if;
  select * into d, c, b from pg_temp.bal('T903');
  if b is distinct from 0 then raise exception 'B3 FAIL T903 balance=% (expected 0)', b; end if;
  select * into d, c, b from pg_temp.bal('T904');
  if b is distinct from 0 then raise exception 'B3 FAIL T904 balance=% (expected 0)', b; end if;
  -- before the reversal instant the original was valid
  select * into d, c, b from pg_temp.bal('T903', t1 + interval '1 day');
  if b is distinct from 200.00 then raise exception 'B3 FAIL T903 as-of before reversal=% (expected 200)', b; end if;
  raise notice 'B3 PASS reversed pair nets 0; as-of before reversal shows 200';

  -- B4 as-of before: entry at t2 excluded
  select * into d, c, b from pg_temp.bal('T905', t2 - interval '1 microsecond');
  if (d, c, b) is distinct from (0.00, 0.00, 0.00) then
    raise exception 'B4 FAIL T905 as-of before=%/%/%', d, c, b;
  end if;
  raise notice 'B4 PASS as-of before excludes later entry';

  -- B5 as-of after (and exact instant, inclusive)
  select * into d, c, b from pg_temp.bal('T905', t2);
  if b is distinct from 50.00 then raise exception 'B5 FAIL T905 as-of exact=%', b; end if;
  select * into d, c, b from pg_temp.bal('T905', t2 + interval '1 day');
  if b is distinct from 50.00 then raise exception 'B5 FAIL T905 as-of after=%', b; end if;
  raise notice 'B5 PASS as-of at/after includes entry';

  -- B6 zero account (only a pending line) still returned with 0/0/0
  select count(*) into n from public.get_account_balances() where code = 'T907';
  select * into d, c, b from pg_temp.bal('T907');
  if n <> 1 or (d, c, b) is distinct from (0.00, 0.00, 0.00) then
    raise exception 'B6 FAIL rows=% values=%/%/%', n, d, c, b;
  end if;
  select count(*) into n from public.get_account_balances(t1 - interval '1 day') where code = 'T901';
  if n <> 1 then raise exception 'B6 FAIL T901 missing at as-of before any movement'; end if;
  raise notice 'B6 PASS zero account returned 0/0/0';

  -- B7 asset sign: Dr 100 Cr 30 -> 70
  select * into d, c, b from pg_temp.bal('T901');
  if b is distinct from 70.00 then raise exception 'B7 FAIL asset balance=%', b; end if;
  raise notice 'B7 PASS asset debit-credit=70';

  -- B8 income sign: Dr 30 Cr 100 -> 70
  select * into d, c, b from pg_temp.bal('T902');
  if (d, c, b) is distinct from (30.00, 100.00, 70.00) then
    raise exception 'B8 FAIL income=%/%/%', d, c, b;
  end if;
  raise notice 'B8 PASS income credit-debit=70';

  -- B9 null as_of == direct aggregate of all posted entries, every active account
  select count(*) into n
  from public.get_account_balances(null) g
  full join (
    select fa.id,
           coalesce(sum(jl.debit)  filter (where je.id is not null), 0) as d,
           coalesce(sum(jl.credit) filter (where je.id is not null), 0) as c
    from public.financial_accounts fa
    left join public.journal_lines jl on jl.financial_account_id = fa.id
    left join public.journal_entries je on je.id = jl.journal_entry_id
                                       and je.status in ('confirmed', 'reversed')
    where fa.is_active
    group by fa.id
  ) x on x.id = g.account_id
  where g.account_id is null or x.id is null
     or g.total_debit <> x.d or g.total_credit <> x.c;
  if n <> 0 then raise exception 'B9 FAIL % accounts differ from direct aggregate', n; end if;
  select count(*) into n from (
    select * from public.get_account_balances(null)
    except all
    select * from public.get_account_balances('infinity')
  ) diff;
  if n <> 0 then raise exception 'B9 FAIL null as_of differs from unbounded as_of'; end if;
  raise notice 'B9 PASS null as_of equals direct aggregate';

  -- B10 ACL + function attributes
  if exists (
       select 1 from pg_proc p, aclexplode(p.proacl) x
       where p.oid = 'public.get_account_balances(timestamptz)'::regprocedure
         and x.grantee = 0 and x.privilege_type = 'EXECUTE')
     or (select proacl is null from pg_proc
         where oid = 'public.get_account_balances(timestamptz)'::regprocedure)
     or has_function_privilege('anon',          'public.get_account_balances(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.get_account_balances(timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.get_account_balances(timestamptz)', 'execute')
  then
    raise exception 'B10 FAIL ACL';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.get_account_balances(timestamptz)'::regprocedure
      and l.lanname = 'sql' and p.prosecdef and p.provolatile = 's')
  then
    raise exception 'B10 FAIL function is not LANGUAGE sql / SECURITY DEFINER / STABLE';
  end if;
  raise notice 'B10 PASS PUBLIC/anon/authenticated=false service_role=true; sql/definer/stable';
end $$;

rollback;
