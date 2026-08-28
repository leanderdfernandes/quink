# Apply 0045 (the brand-wash control) transactionally, with assertions.
#
#     cd C:\Qunk && python supabase/apply_0045.py
#
# Additive and far smaller than 0044 — one column, one grant, no function touched — so the
# assertions are correspondingly short. They check the three things that would be silently
# wrong rather than loudly broken: the default is the value that reproduces today's render,
# the CHECK actually refuses an out-of-range write, and the column is client-writable
# (unlike product_context, which must not be).
import sys
import psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
PATH = 'supabase/migrations/0045_brand_wash.sql'
SQL = open(PATH, encoding='utf-8').read()

conn = psycopg2.connect(URL)
cur = conn.cursor()
fail = []


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('   ' + str(detail)) if detail else ''}")
    if not ok:
        fail.append(label)


cur.execute("select count(*) from public.knowledge_bases")
before = cur.fetchone()[0]

cur.execute(SQL)

cur.execute("""select data_type, is_nullable, column_default from information_schema.columns
               where table_schema='public' and table_name='knowledge_bases'
                 and column_name='brand_wash'""")
row = cur.fetchone()
check('brand_wash exists, smallint, not null', row is not None and row[0] == 'smallint' and row[1] == 'NO', row)

# Every existing help center must render EXACTLY as it did before this migration, which is
# what the 9 default is for. A row on any other value means the backfill did something.
cur.execute("select count(*) from public.knowledge_bases where brand_wash <> 9")
check('every existing help center is on the design system default', cur.fetchone()[0] == 0)
cur.execute("select count(*) from public.knowledge_bases")
check('no rows disturbed', cur.fetchone()[0] == before, f'{before} before')

# The CHECK is the control; the slider's min/max is a courtesy. Prove it refuses.
for bad in (-1, 31):
    cur.execute('savepoint probe')
    try:
        cur.execute('update public.knowledge_bases set brand_wash = %s', (bad,))
        check(f'{bad} is refused by the CHECK', False, 'it was accepted')
        cur.execute('rollback to savepoint probe')
    except psycopg2.errors.CheckViolation:
        cur.execute('rollback to savepoint probe')
        check(f'{bad} is refused by the CHECK', True)

cur.execute("select has_column_privilege('authenticated','public.knowledge_bases','brand_wash','update')")
check('authenticated may write it (theming is editor-gated)', cur.fetchone()[0] is True)
cur.execute("select has_column_privilege('anon','public.knowledge_bases','brand_wash','update')")
check('anon may NOT write it', cur.fetchone()[0] is False)

if fail:
    conn.rollback()
    print('\nROLLED BACK: ' + ', '.join(fail))
    sys.exit(1)
conn.commit()
print('\nCOMMITTED 0045')
