# Apply 0040 transactionally, asserting every structural fact before commit.
# Same shape and same reasoning as apply_migration.py (which carries 0039's assertions
# only, deliberately). No staging project exists yet — see OPEN-ITEMS E.
import sys, psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
SQL = open('supabase/migrations/0040_product_context_rpc.sql', encoding='utf-8').read()

fail = []
def check(label, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{detail}]' if detail else ''))
    if not ok: fail.append(label)

conn = psycopg2.connect(URL); conn.autocommit = False; cur = conn.cursor()

cur.execute("select count(*) from public.knowledge_bases where product_name <> ''")
before = cur.fetchone()[0]
print(f'KBs with a product name: {before}')

try:
    cur.execute(SQL)
except Exception as e:
    conn.rollback(); print(f'FAIL  migration raised: {e}'); sys.exit(1)

cur.execute("""select column_name from information_schema.columns
               where table_schema='public' and table_name='knowledge_bases'
                 and column_name like 'product_context_%' order by 1""")
check('audit columns added', [r[0] for r in cur.fetchall()] ==
      ['product_context_updated_at', 'product_context_updated_by'])

cur.execute("""select column_name from information_schema.column_privileges
               where table_name='knowledge_bases' and grantee='authenticated'
                 and privilege_type='UPDATE' order by 1""")
upd = [r[0] for r in cur.fetchall()]
check('four columns no longer client-writable',
      not ({'product_name','product_description','audience','tone'} & set(upd)), ','.join(upd))
check('theming columns still writable', {'name','about','primary_color'} <= set(upd))

cur.execute("select prosecdef from pg_proc where oid='public.set_product_context(uuid,text,text,text,text)'::regprocedure")
check('set_product_context is SECURITY DEFINER', cur.fetchone()[0] is True)

cur.execute("""select has_function_privilege('authenticated',
               'public.set_product_context(uuid,text,text,text,text)', 'execute')""")
check('authenticated may execute', cur.fetchone()[0] is True)
cur.execute("""select has_function_privilege('anon',
               'public.set_product_context(uuid,text,text,text,text)', 'execute')""")
check('anon may NOT execute', cur.fetchone()[0] is False)

cur.execute("select prosrc from pg_proc where oid='public.set_product_context(uuid,text,text,text,text)'::regprocedure")
src = cur.fetchone()[0]
check('identity from auth.uid(), not an argument', 'auth.uid()' in src and 'p_user_id' not in src)
check('guarded by can_edit_kb()', 'can_edit_kb(p_kb_id)' in src)
check('600 cap enforced in the body', 'product_context_cap()' in src)

cur.execute("select public.product_context_cap()")
check('cap is 600', cur.fetchone()[0] == 600)

cur.execute("select count(*) from public.knowledge_bases where product_name <> ''")
check('no rows disturbed', cur.fetchone()[0] == before)

if fail:
    conn.rollback(); print('\nROLLED BACK: ' + ', '.join(fail)); sys.exit(1)
conn.commit(); print('\nCOMMITTED 0040')
