// LOCAL ONLY. All committed concurrency fixtures live in a disposable database.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
const container = 'supabase_db_mi-punto-de-venta'
const db = 'profit02a2_local_test'
const user = '3f000000-0000-0000-0000-000000000002'
const root = new URL('../../', import.meta.url)
let owned = false
function run(args, input) {
  const r = spawnSync('docker', ['exec', '-i', container, ...args], { input, encoding: 'utf8', maxBuffer: 30e6 })
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || String(r.error))
  return r.stdout.trim()
}
const sql = q => run(['psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'], q)
const file = p => sql(readFileSync(new URL(p, root), 'utf8'))
function start(q, name) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'])
  let out = ''; let err = ''
  child.stdout.on('data', b => { out += b }); child.stderr.on('data', b => { err += b })
  const done = new Promise(resolve => child.on('close', code => resolve({ code, out, err })))
  child.stdin.end(`set application_name='${name}'; set statement_timeout='15s'; ${q}`)
  return done
}
async function waitState(name, condition) {
  for (let n=0;n<60;n++) {
    if (sql(`select exists(select 1 from pg_stat_activity where datname='${db}' and application_name='${name}' and ${condition});`)==='t') return
    await delay(100)
  }
  throw new Error(`State not observed: ${name} ${condition}`)
}
try {
  run(['createdb','-U','postgres',db]); owned=true
  run(['bash','-c',`set -o pipefail; export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U postgres --no-privileges postgres | psql -X -U supabase_admin -d ${db} -v ON_ERROR_STOP=1 >/dev/null`])
  run(['bash','-c',`export PGPASSWORD="$POSTGRES_PASSWORD"; psql -X -U supabase_admin -d ${db} -v ON_ERROR_STOP=1 -c 'grant usage on schema auth to postgres, supabase_auth_admin; grant all on auth.users to postgres;'`])
  file('supabase/migrations/20261005194051_centralize_cash_session_profit.sql')
  file('supabase/migrations/20261005222052_operational_sale_session_attribution.sql')
  file('sql/local/2026-10-05_test_cash_session_profit_local.sql')
  console.log('PASS A-H x 3 close paths, helper edge cases, financial attribution')
  file('sql/local/2026-10-01_test_cash_expected_ledger_local.sql')
  console.log('PASS CAJA-03B B1-B17 / S2-S4')
  sql(`insert into auth.users(id) values('${user}'); insert into public.app_profiles(id,username,email,is_superadmin) values('${user}','profit02a2','profit02a2@app.local',true); insert into public.ledger_settings(id,ledger_cutover_at,activated_by,activated_at) values(true,now()-interval '1 day','${user}',now()) on conflict(id) do update set ledger_cutover_at=excluded.ledger_cutover_at;`)
  const {bar,mat,station}=JSON.parse(sql(`select json_build_object('bar',i.center_id,'mat',i.material_id,'station',(select id from public.tables where status='libre' limit 1)) from public.inventory i join public.materials m on m.id=i.material_id join public.categories c on c.id=m.cat_id join public.centers b on b.id=i.center_id where lower(trim(b.name))='bar principal' and c.is_for_sale and i.precio_venta>0 limit 1;`))
  assert.ok(bar && mat && station)
  sql(`update public.inventory set costo_promedio=60,precio_venta=100,stock_actual=1000 where center_id='${bar}' and material_id='${mat}';`)
  const setup=()=>JSON.parse(sql(`with s as (insert into public.cash_sessions(status,opening_amount,opened_by) values('open',100,'${user}') returning id) select json_build_object('sid',id,'oid',gen_random_uuid()) from s;`))
  const activate=f=>sql(`insert into public.table_orders(id,table_id,items,total) values('${f.oid}','${station}','[]',200); update public.tables set status='ocupada',current_order_id='${f.oid}' where id='${station}';`)
  const sale=f=>`public.finalize_pos_sale('${station}','[{"order_id":"${f.oid}","material_id":"${mat}","quantity":2}]','[{"method":"Tarjeta","amount":200}]','${user}',null)`
  const clean=f=>sql(`update public.tables set status='libre',current_order_id=null where id='${station}'; delete from public.table_orders where id='${f.oid}';`)
  const snapshot=()=>sql(`select json_build_array((select count(*) from public.sales),(select count(*) from public.journal_entries),(select stock_actual from public.inventory where material_id='${mat}' and center_id='${bar}'));`)
  function reject(f,pattern) { const before=snapshot(); assert.throws(()=>sql(`select ${sale(f)};`),pattern); assert.equal(snapshot(),before) }
  let f=setup(); activate(f); sql(`delete from public.cash_sessions where id='${f.sid}';`)
  reject(f,/No hay una caja abierta/); clean(f)
  console.log('PASS no-session rejection, no side effects')
  f=setup(); activate(f); sql(`update public.cash_sessions set first_counted_cash=99 where id='${f.sid}';`)
  reject(f,/proceso de cierre/); clean(f); sql(`delete from public.cash_sessions where id='${f.sid}';`)
  console.log('PASS counted-session rejection, no side effects')
  f=setup(); activate(f)
  let a=start(`begin; select ${sale(f)}; select pg_sleep(4); commit;`,'profit_sale_first')
  await waitState('profit_sale_first',"wait_event='PgSleep'")
  let b=start(`select public.record_first_cash_count_atomic('${f.sid}',100,'${user}');`,'profit_close_second')
  await waitState('profit_close_second',"wait_event_type='Lock'")
  let results=await Promise.all([a,b]); assert.ok(results.every(r=>r.code===0),JSON.stringify(results))
  assert.equal(sql(`select status || ':' || profit_total::text from public.cash_sessions where id='${f.sid}';`),'closed:80.00')
  console.log('PASS race sale-first: actual count waits, then closes with profit 80')
  f=setup()
  a=start(`begin; select public.record_first_cash_count_atomic('${f.sid}',100,'${user}'); select pg_sleep(4); commit;`,'profit_close_first')
  await waitState('profit_close_first',"wait_event='PgSleep'")
  b=start(`begin; insert into public.table_orders(id,table_id,items,total) values('${f.oid}','${station}','[]',200); update public.tables set status='ocupada',current_order_id='${f.oid}' where id='${station}'; select ${sale(f)}; commit;`,'profit_sale_second')
  await waitState('profit_sale_second',"wait_event_type='Lock'")
  results=await Promise.all([a,b]); assert.equal(results[0].code,0); assert.notEqual(results[1].code,0); assert.match(results[1].err,/No hay una caja abierta/)
  assert.equal(sql(`select count(*) from public.sales where cash_session_id='${f.sid}';`),'0')
  console.log('PASS race close-first: activation waits and rejects; no sale')
  // Adversarial fixture isolates the new post-lock recheck, without disabling triggers.
  f=setup(); activate(f)
  a=start(`begin; update public.cash_sessions set first_counted_cash=99 where id='${f.sid}'; select pg_sleep(4); commit;`,'profit_count_marker')
  await waitState('profit_count_marker',"wait_event='PgSleep'")
  b=start(`select ${sale(f)};`,'profit_sale_waiter')
  await waitState('profit_sale_waiter',"wait_event_type='Lock'")
  results=await Promise.all([a,b]); assert.equal(results[0].code,0); assert.notEqual(results[1].code,0); assert.match(results[1].err,/proceso de cierre/)
  assert.equal(sql(`select count(*) from public.sales where cash_session_id='${f.sid}';`),'0')
  clean(f); sql(`delete from public.cash_sessions where id='${f.sid}';`)
  console.log('PASS race post-lock recheck rejects concurrent count marker')
  file('sql/local/2026-10-05_rollback_profit02a2_local.sql')
  f=setup(); activate(f); let result=JSON.parse(sql(`select ${sale(f)};`)); assert.equal(result.cash_session_id,null)
  sql(`select public.record_first_cash_count_atomic('${f.sid}',100,'${user}');`)
  file('supabase/migrations/20261005222052_operational_sale_session_attribution.sql')
  f=setup(); activate(f); result=JSON.parse(sql(`select ${sale(f)};`)); assert.equal(result.cash_session_id,f.sid)
  assert.equal(sql(`select cash_session_id is null from public.financial_operations where id='${result.financial_operation_id}';`),'t')
  console.log('PASS rollback and reapply, financial NULL preserved')
} finally {
  if (owned) { run(['dropdb','-U','postgres','--force',db]); console.log('Disposable database removed') }
}
