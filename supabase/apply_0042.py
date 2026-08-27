# Apply 0042 transactionally. The assertion that matters is the column allowlist: `jobs`
# has no table SELECT grant, so a column is invisible to clients unless it is named — and
# the one column that must STAY invisible is clarification_answers.
import sys, psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
SQL = open('supabase/migrations/0042_clarifications.sql', encoding='utf-8').read()

fail = []
def check(label, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{detail}]' if detail else ''))
    if not ok: fail.append(label)

conn = psycopg2.connect(URL); conn.autocommit = False; cur = conn.cursor()

cur.execute("""select column_name from information_schema.column_privileges
               where table_name='jobs' and grantee='authenticated' and privilege_type='SELECT'""")
before = {r[0] for r in cur.fetchall()}
print(f'jobs columns visible to clients before: {len(before)}')

try:
    cur.execute(SQL)
except Exception as e:
    conn.rollback(); print(f'FAIL  migration raised: {e}'); sys.exit(1)

cur.execute("""select column_name from information_schema.columns
               where table_schema='public' and table_name='jobs'
                 and column_name in ('clarifications','clarification_answers','awaiting_input')""")
check('three columns added', len({r[0] for r in cur.fetchall()}) == 3)

cur.execute("""select column_name from information_schema.column_privileges
               where table_name='jobs' and grantee='authenticated' and privilege_type='SELECT'""")
after = {r[0] for r in cur.fetchall()}
check('exactly the two intended columns became visible',
      after - before == {'clarifications', 'awaiting_input'}, ','.join(sorted(after - before)))
check('clarification_answers stays invisible to clients',
      'clarification_answers' not in after)
check('failure_detail is still not exposed', 'failure_detail' not in after)

cur.execute("""select column_name from information_schema.column_privileges
               where table_name='jobs' and grantee='anon' and privilege_type='SELECT'""")
anon = {r[0] for r in cur.fetchall()}
check('anon sees the same two and no more', anon == after, str(len(anon)))

cur.execute("select column_default, is_nullable from information_schema.columns "
            "where table_name='jobs' and column_name='awaiting_input'")
d, n = cur.fetchone()
check('awaiting_input defaults false and not null', d == 'false' and n == 'NO', f'{d}/{n}')

cur.execute("select count(*) from public.jobs where awaiting_input")
check('no existing job was left waiting', cur.fetchone()[0] == 0)

cur.execute("""select column_name from information_schema.columns
               where table_schema='public' and table_name='articles'
                 and column_name='open_clarifications'""")
check('articles.open_clarifications added', cur.fetchone() is not None)

cur.execute("select indexdef from pg_indexes where indexname='jobs_awaiting_input_idx'")
row = cur.fetchone()
check('the poll index is partial', row is not None and 'WHERE awaiting_input' in row[0])

if fail:
    conn.rollback(); print('\nROLLED BACK: ' + ', '.join(fail)); sys.exit(1)
conn.commit(); print('\nCOMMITTED 0042')
