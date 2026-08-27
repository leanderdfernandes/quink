# Apply 0041 transactionally, asserting every structural fact before commit.
# The risk this covers is D.4's: a recreated function body that silently loses a clause.
# So the checks are not "the new column is there" — they are that every OLD answer is
# unchanged, compared row for row against a snapshot taken before the migration ran.
import sys, psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
SQL = open('supabase/migrations/0041_video_retention.sql', encoding='utf-8').read()

OLD_ENT = ['is_owner', 'plan', 'owner_name', 'lifetime_runs', 'runs_used',
           'cycle_runs_used', 'expiry_days', 'can_invite', 'watermark', 'noindex']
OLD_FLAGS = ['noindex', 'watermark', 'lifetime_runs', 'expiry_days', 'can_invite']

fail = []
def check(label, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{detail}]' if detail else ''))
    if not ok: fail.append(label)

conn = psycopg2.connect(URL); conn.autocommit = False; cur = conn.cursor()

# --- before: every KB's entitlements, and plan_flags for every tier ---------------------
cur.execute("""
create temp table _ent_before on commit drop as
select kb.id as kb_id, e.* from public.knowledge_bases kb,
       lateral public.kb_entitlements(kb.id) e
""")
cur.execute('select count(*) from _ent_before')
print(f'kb rows snapshotted: {cur.fetchone()[0]}  '
      '(kb_entitlements is SECURITY DEFINER, so it answers for every KB here)')
cur.execute("""
create temp table _flags_before on commit drop as
select t.p, f.* from (values ('free'),('founding'),('starter'),('growth'),('internal'),
                             (null)) t(p), lateral public.plan_flags(t.p) f
""")

try:
    cur.execute(SQL)
except Exception as e:
    conn.rollback(); print(f'FAIL  migration raised: {e}'); sys.exit(1)

# --- after -----------------------------------------------------------------------------
cur.execute("select unnest(proargnames) from pg_proc where oid='public.kb_entitlements(uuid)'::regprocedure")
names = [r[0] for r in cur.fetchall()][1:]
check('kb_entitlements: old columns unchanged, one appended',
      names == OLD_ENT + ['video_retention_days'], ','.join(names))

cur.execute("select unnest(proargnames) from pg_proc where oid='public.plan_flags(text)'::regprocedure")
fnames = [r[0] for r in cur.fetchall()][1:]
check('plan_flags: old columns unchanged, one appended',
      fnames == OLD_FLAGS + ['video_retention_days'], ','.join(fnames))

# THE assertion that matters: every pre-existing answer is byte-identical.
cur.execute(f"""
select count(*) from _ent_before b
  join public.knowledge_bases kb on kb.id = b.kb_id,
  lateral public.kb_entitlements(kb.id) a
 where ({','.join('b.'+c for c in OLD_ENT)}) is distinct from ({','.join('a.'+c for c in OLD_ENT)})
""")
check('no KB answers differently on any pre-existing column', cur.fetchone()[0] == 0)

cur.execute(f"""
select count(*) from _flags_before b, lateral public.plan_flags(b.p) a
 where ({','.join('b.'+c for c in OLD_FLAGS)}) is distinct from ({','.join('a.'+c for c in OLD_FLAGS)})
""")
check('no plan_flags tier answers differently', cur.fetchone()[0] == 0)

# The watermark clause specifically — the thing 0024-0026 lost (§10l, OPEN-ITEMS D.4).
cur.execute("select prosrc from pg_proc where oid='public.kb_entitlements(uuid)'::regprocedure")
src = cur.fetchone()[0]
check('watermark still goes through kb_watermark(plan, is_demo)',
      'kb_watermark(p.plan, kb.is_demo)' in src)
check('offline still forces noindex', 'kb.offline_at is null' in src)
check('runs still counted by billed_to_user_id, never through kb_id',
      src.count('billed_to_user_id') == 2 and 'j.kb_id' not in src)
check('plan name still owner-only',
      'case when kb.owner_id = (select auth.uid()) then p.plan else null end' in src)

cur.execute("select video_retention_days from public.plan_flags('free')")
check('free window is 7', cur.fetchone()[0] == 7)
for tier in ('founding', 'starter', 'growth', 'internal'):
    cur.execute('select video_retention_days from public.plan_flags(%s)', (tier,))
    check(f'{tier} keeps it for the life of the article', cur.fetchone()[0] is None)

for fn, anon, auth in (('public.plan_flags(text)', True, True),
                       ('public.kb_entitlements(uuid)', False, True)):
    cur.execute('select has_function_privilege(%s,%s,%s)', ('anon', fn, 'execute'))
    check(f'{fn} anon execute unchanged', cur.fetchone()[0] is anon)
    cur.execute('select has_function_privilege(%s,%s,%s)', ('authenticated', fn, 'execute'))
    check(f'{fn} authenticated execute unchanged', cur.fetchone()[0] is auth)

if fail:
    conn.rollback(); print('\nROLLED BACK: ' + ', '.join(fail)); sys.exit(1)
conn.commit(); print('\nCOMMITTED 0041')
