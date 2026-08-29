# Apply 0047 (jobs.context_chars) transactionally, with assertions.
#
#     python supabase/apply_0047.py
#
# CLAUDE.md §10m: staging first, then production. This script is written to be run against
# either -- it names no environment and asserts only properties that must hold on both.
#
# Additive and recreates no function, so there is no live-definition diff to guard. The
# assertions that matter are the two that are easy to get wrong: the column must NOT be
# readable by clients (0020's explicit grant list is the mechanism, and a new column
# inheriting a table grant is exactly the §10e.2 trap), and nothing else on `jobs` may have
# moved.
import sys
import psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
PATH = 'supabase/migrations/0047_job_context_chars.sql'
SQL = open(PATH, encoding='utf-8').read()

conn = psycopg2.connect(URL)
cur = conn.cursor()
fail = []


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('   ' + str(detail)) if detail else ''}")
    if not ok:
        fail.append(label)


# --- BEFORE: every column on jobs, and every column a client may read --------------------
cur.execute("""select column_name, data_type from information_schema.columns
                where table_schema='public' and table_name='jobs' order by 1""")
before_cols = dict(cur.fetchall())

cur.execute("""select column_name from information_schema.column_privileges
                where table_schema='public' and table_name='jobs'
                  and grantee in ('anon','authenticated') and privilege_type='SELECT'
                order by 1""")
before_readable = sorted({r[0] for r in cur.fetchall()})
print(f'jobs has {len(before_cols)} columns, {len(before_readable)} readable by clients')

# --- APPLY -------------------------------------------------------------------------------
cur.execute(SQL)

# --- AFTER -------------------------------------------------------------------------------
cur.execute("""select data_type, is_nullable from information_schema.columns
                where table_schema='public' and table_name='jobs'
                  and column_name='context_chars'""")
row = cur.fetchone()
check('context_chars exists, integer, nullable', row == ('integer', 'YES'), row)

cur.execute("""select column_name, data_type from information_schema.columns
                where table_schema='public' and table_name='jobs' order by 1""")
after_cols = dict(cur.fetchall())
check('exactly one column added, nothing else changed',
      set(after_cols) - set(before_cols) == {'context_chars'}
      and all(before_cols[c] == after_cols[c] for c in before_cols),
      sorted(set(after_cols) ^ set(before_cols)))

# THE ONE THAT MATTERS. 0020 revoked table SELECT and grants back a column list; a new
# column must NOT appear in it. If this ever fails, the grant has been widened back to the
# table and every future column on jobs is client-readable the moment it exists.
cur.execute("""select column_name from information_schema.column_privileges
                where table_schema='public' and table_name='jobs'
                  and grantee in ('anon','authenticated') and privilege_type='SELECT'
                order by 1""")
after_readable = sorted({r[0] for r in cur.fetchall()})
check('context_chars is NOT readable by anon/authenticated',
      'context_chars' not in after_readable)
check('no other column became readable', after_readable == before_readable,
      sorted(set(after_readable) ^ set(before_readable)))

for role in ('anon', 'authenticated'):
    cur.execute("select has_column_privilege(%s,'public.jobs','context_chars','select')", (role,))
    check(f'{role} may NOT select context_chars', cur.fetchone()[0] is False)

# Existing rows are untouched -- this is analysis data for runs from here on, and
# backfilling it would mean inventing a number for runs whose prompt we cannot rebuild.
cur.execute('select count(*) from public.jobs where context_chars is not null')
check('no existing row was backfilled', cur.fetchone()[0] == 0)

cur.execute("""select col_description('public.jobs'::regclass, ordinal_position)
                 from information_schema.columns
                where table_schema='public' and table_name='jobs'
                  and column_name='context_chars'""")
check('column is commented', bool(cur.fetchone()[0]))

if fail:
    conn.rollback()
    sys.exit(f'ROLLED BACK — {len(fail)} check(s) failed: {fail}')
conn.commit()
print('0047 applied and committed.')
