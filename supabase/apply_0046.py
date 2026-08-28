# Apply 0046 (brand_wash reaches the reader) transactionally, with assertions.
#
#     cd C:\Qunk && python supabase/apply_0046.py
#
# This one recreates reader_kb, which is the function OPEN-ITEMS D.4 is about: 0024 rebuilt
# it from an older body, dropped the watermark clause, and 0025/0026 carried the loss for
# three migrations because nothing checked. So the assertions here are not about the new
# column — they are about everything that must NOT have changed.
#
# The strongest of them compares the live result row by row against a snapshot taken BEFORE
# the migration, for every help center on the box. If any existing column moved, changed
# value, or lost its offline collapse, that comparison fails and the transaction rolls back.
import sys
import psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
PATH = 'supabase/migrations/0046_reader_brand_wash.sql'
SQL = open(PATH, encoding='utf-8').read()

conn = psycopg2.connect(URL)
cur = conn.cursor()
fail = []


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('   ' + str(detail)) if detail else ''}")
    if not ok:
        fail.append(label)


# --- BEFORE: the exact output of the live function, for every resolvable help center ------
cur.execute("""select subdomain from public.knowledge_bases
                where subdomain is not null order by subdomain""")
keys = [r[0] for r in cur.fetchall()]
print(f'snapshotting reader_kb for {len(keys)} help centers')

cur.execute("""select p.proname, pg_get_function_result(p.oid)
                 from pg_proc p where p.proname = 'reader_kb'""")
before_sig = cur.fetchone()[1]

before = {}
for k in keys:
    cur.execute('select * from public.reader_kb(%s)', (k,))
    cols = [d.name for d in cur.description]
    row = cur.fetchone()
    before[k] = dict(zip(cols, row)) if row else None

cur.execute(SQL)

# --- The added column ----------------------------------------------------------------------
after_sig = None
cur.execute("""select pg_get_function_result(p.oid) from pg_proc p where p.proname = 'reader_kb'""")
after_sig = cur.fetchone()[0]
check('brand_wash is in the result type', 'brand_wash smallint' in after_sig)
check('it sits immediately after primary_color',
      'primary_color text, brand_wash smallint' in after_sig, after_sig[:120])

# Exactly one overload: a leftover would mean PostgREST could pick either.
cur.execute("select count(*) from pg_proc where proname='reader_kb'")
check('exactly ONE reader_kb', cur.fetchone()[0] == 1)

# --- The things D.4 is about ----------------------------------------------------------------
cur.execute("select prosrc from pg_proc where proname='reader_kb'")
src = cur.fetchone()[0]
check('the watermark clause survived', 'kb_watermark(p.plan, kb.is_demo)' in src)
check('the offline gate survived', src.count('offline_at is null') >= 15)
check('resolves by hostname, not by id', 'kb.subdomain = p_key' in src and 'custom_domain' in src)

cur.execute("select prosecdef, provolatile from pg_proc where proname='reader_kb'")
secdef, volat = cur.fetchone()
check('still SECURITY DEFINER', secdef is True)
check('still STABLE', volat == 's', volat)

cur.execute("select has_function_privilege('anon','public.reader_kb(text)','execute')")
check('anon may execute (the reader has no session)', cur.fetchone()[0] is True)
cur.execute("select has_function_privilege('authenticated','public.reader_kb(text)','execute')")
check('authenticated may execute', cur.fetchone()[0] is True)

# --- EVERY OTHER COLUMN IS BYTE-IDENTICAL ----------------------------------------------------
drift = []
for k in keys:
    cur.execute('select * from public.reader_kb(%s)', (k,))
    cols = [d.name for d in cur.description]
    row = cur.fetchone()
    after = dict(zip(cols, row)) if row else None
    if before[k] is None or after is None:
        if before[k] is not after:
            drift.append(f'{k}: resolvability changed')
        continue
    for col, was in before[k].items():
        if after.get(col) != was:
            drift.append(f'{k}.{col}')
check('every pre-existing column is unchanged for every help center',
      not drift, ', '.join(drift[:6]) if drift else f'{len(keys)} checked')

cur.execute("select count(*) from public.reader_kb(%s) where brand_wash = 9", (keys[0],)) if keys else None
if keys:
    check('brand_wash comes back as the default', cur.fetchone()[0] == 1)

if fail:
    conn.rollback()
    print('\nROLLED BACK: ' + ', '.join(fail))
    sys.exit(1)
conn.commit()
print('\nCOMMITTED 0046')
