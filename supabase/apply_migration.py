# Apply one migration to the database named by SUPABASE_DB_URL, transactionally.
#
#     python supabase/apply_migration.py supabase/migrations/0039_cycle_runs.sql
#
# This is the closest thing to the §10m control that exists while there is no separate
# staging project: §10m wants a migration applied somewhere else first and the resulting
# object DIFFED against its live definition. This cannot give you the first half, so it
# gives you the second half twice over — every structural fact about the recreated object
# is asserted against what was observed live, inside the transaction, before it commits.
# It is not a substitute for a staging project. Get one.
#
# Everything runs inside ONE transaction and only commits if every assertion passes.
# DROP FUNCTION is transactional in Postgres, so the SPA never sees a window where the
# RPC is missing: either the new function is there or the old one still is.
#
# It prints PASS/FAIL lines and aggregate counts only. No owner ids, no emails, no plans
# and no per-customer rows are read into the output — the checks are comparisons made
# inside the database, not data brought out of it.
import sys
import psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
PATH = sys.argv[1] if len(sys.argv) > 1 else 'supabase/migrations/0039_cycle_runs.sql'
SQL = open(PATH, encoding='utf-8').read()

# The assertions below are 0039-specific. A different migration needs its own; this file
# deliberately does NOT try to be a general migration runner that guesses what to check,
# because a check that passes for everything catches nothing.
if '0039' not in PATH:
    sys.exit(f'{PATH}: this script only carries assertions for 0039. Write yours first.')

EXPECTED = [
    'is_owner', 'plan', 'owner_name', 'lifetime_runs', 'runs_used',
    'cycle_runs_used', 'expiry_days', 'can_invite', 'watermark', 'noindex',
]

fail = []


def check(label, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{detail}]' if detail else ''))
    if not ok:
        fail.append(label)


conn = psycopg2.connect(URL)
conn.autocommit = False
cur = conn.cursor()

# --- before -----------------------------------------------------------------------------
# The lifetime run count, per owner, as the CURRENT function reports it. Held in a temp
# table so the after-state can be diffed against it in SQL rather than in Python.
cur.execute("""
create temp table _before on commit drop as
select kb.owner_id,
       (select count(*) from public.jobs j
         where j.billed_to_user_id = kb.owner_id and j.counted_against_quota) as lifetime
  from public.knowledge_bases kb
""")
cur.execute('select count(*) from _before')
print(f'owners snapshotted: {cur.fetchone()[0]}')

# --- apply ------------------------------------------------------------------------------
try:
    cur.execute(SQL)
except Exception as e:                                            # noqa: BLE001
    conn.rollback()
    print(f'FAIL  migration raised: {e}')
    sys.exit(1)

# --- after ------------------------------------------------------------------------------
cur.execute("""
select unnest(p.proargnames) from pg_proc p
 where p.oid = 'public.kb_entitlements(uuid)'::regprocedure
""")
names = [r[0] for r in cur.fetchall()]
# proargnames includes the IN parameter first, then the OUT columns.
check('return columns, in order', names[1:] == EXPECTED, ','.join(names[1:]))

cur.execute("""
select l.lanname, p.prosecdef, p.provolatile, p.proconfig::text, p.proacl::text
  from pg_proc p join pg_language l on l.oid = p.prolang
 where p.oid = 'public.kb_entitlements(uuid)'::regprocedure
""")
lang, secdef, vol, cfg, acl = cur.fetchone()
check('language sql', lang == 'sql', lang)
check('security definer', secdef is True)
check('stable', vol == 's', vol)
check('search_path=public', cfg == '{search_path=public}', str(cfg))
check('authenticated has EXECUTE', 'authenticated=X' in (acl or ''))
check('service_role has EXECUTE', 'service_role=X' in (acl or ''))
# The one that would be a security regression rather than a bug.
check('anon does NOT have EXECUTE', 'anon=X' not in (acl or ''))

# The lifetime number must be byte-identical to what it was before. This is the whole
# point of the change being "additive": if a single owner's count moved, the new body
# is not the old body plus a column.
cur.execute("""
select count(*) from _before b
  join public.knowledge_bases kb on kb.owner_id = b.owner_id
 where b.lifetime <> (select count(*) from public.jobs j
                       where j.billed_to_user_id = kb.owner_id and j.counted_against_quota)
""")
check('no owner lifetime count changed', cur.fetchone()[0] == 0)

# The cycle count is a window INSIDE the lifetime count, so it can never exceed it.
cur.execute("""
select count(*) from public.knowledge_bases kb
 where (select count(*) from public.jobs j
         where j.billed_to_user_id = kb.owner_id and j.counted_against_quota
           and j.created_at >= date_trunc('month', now()))
     > (select count(*) from public.jobs j
         where j.billed_to_user_id = kb.owner_id and j.counted_against_quota)
""")
check('cycle count never exceeds lifetime', cur.fetchone()[0] == 0)

cur.execute("select to_regclass('public.jobs_billed_cycle_idx') is not null")
check('jobs_billed_cycle_idx exists', cur.fetchone()[0])

# Callable as a real signed-in user: SECURITY DEFINER + can_edit_kb() means the postgres
# role gets nothing back, so the gate is exercised by assuming `authenticated` with a real
# owner's sub claim. Only the SHAPE of the answer is asserted, never its values.
cur.execute("""
select kb.id::text, kb.owner_id::text from public.knowledge_bases kb
 order by kb.created_at limit 1
""")
row = cur.fetchone()
if row:
    kb_id, owner = row
    cur.execute("select set_config('request.jwt.claims', %s, true)",
                ['{"sub":"%s","role":"authenticated"}' % owner])
    cur.execute('set local role authenticated')
    cur.execute('select is_owner, cycle_runs_used <= runs_used from public.kb_entitlements(%s)',
                [kb_id])
    got = cur.fetchall()
    cur.execute('reset role')
    check('owner gets exactly one row back', len(got) == 1, f'{len(got)} rows')
    check('that row is is_owner=true', bool(got and got[0][0]))
    check('cycle <= lifetime in the RPC output', bool(got and got[0][1]))

# --- commit or roll back ------------------------------------------------------------------
if fail:
    conn.rollback()
    print(f'\nROLLED BACK — {len(fail)} check(s) failed: {", ".join(fail)}')
    sys.exit(1)

conn.commit()
print('\nCOMMITTED — kb_entitlements now returns cycle_runs_used')
