# Apply 0043 transactionally. The two things worth asserting are that the new timing
# columns did NOT become client-visible, and that the RPC derives identity from auth.uid()
# rather than from a parameter (§10e.1).
import sys, psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
SQL = open('supabase/migrations/0043_clarification_answers.sql', encoding='utf-8').read()
SIG = 'public.submit_clarification_answers(uuid,jsonb,text)'

fail = []


def check(label, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{detail}]' if detail else ''))
    if not ok:
        fail.append(label)


conn = psycopg2.connect(URL)
conn.autocommit = False
cur = conn.cursor()

cur.execute("""select column_name from information_schema.column_privileges
               where table_name='jobs' and grantee='authenticated' and privilege_type='SELECT'""")
before = {r[0] for r in cur.fetchall()}

try:
    cur.execute(SQL)
except Exception as e:                                                   # noqa: BLE001
    conn.rollback()
    print(f'FAIL  migration raised: {e}')
    sys.exit(1)

cur.execute("""select column_name from information_schema.columns
               where table_schema='public' and table_name='jobs'
                 and column_name in ('awaiting_input_at','clarifications_closed_at')""")
check('two timing columns added', len(cur.fetchall()) == 2)

cur.execute("""select column_name from information_schema.column_privileges
               where table_name='jobs' and grantee='authenticated' and privilege_type='SELECT'""")
check('neither became client-visible', {r[0] for r in cur.fetchall()} == before)

cur.execute(f"select prosecdef from pg_proc where oid='{SIG}'::regprocedure")
check('SECURITY DEFINER', cur.fetchone()[0] is True)

cur.execute(f"select prosrc from pg_proc where oid='{SIG}'::regprocedure")
src = cur.fetchone()[0]
check('identity comes from auth.uid()', 'auth.uid()' in src)
# Checked against the SIGNATURE, not the body: the body's comment says the words
# "p_user_id" on purpose, and a grep would call that a violation.
cur.execute(f"select proargnames from pg_proc where oid='{SIG}'::regprocedure")
args = cur.fetchone()[0]
check('...and no argument stands in for who is calling',
      not any('user' in a or 'uid' in a or 'actor' in a for a in args), ','.join(args))
check('gated on can_edit_kb', 'can_edit_kb(v_job.kb_id)' in src)
check('answers checked against the stored option ids', "o ->> 'id' = v_answer" in src)
check('free text only for element_name', "'element_name'" in src)
check('the note is capped', 'left(v_note, 600)' in src)

cur.execute(f"select has_function_privilege('anon','{SIG}','execute')")
check('anon may NOT execute', cur.fetchone()[0] is False)
cur.execute(f"select has_function_privilege('authenticated','{SIG}','execute')")
check('authenticated may execute', cur.fetchone()[0] is True)

if fail:
    conn.rollback()
    print('\nROLLED BACK: ' + ', '.join(fail))
    sys.exit(1)
conn.commit()
print('\nCOMMITTED 0043')
