# Apply 0044 (the product-context fold) transactionally, with assertions.
#
#     cd C:\Qunk && python supabase/apply_0044.py
#
# Same shape as apply_0040/41/42/43 and the same caveat: this is NOT a staging project, it
# is the §10m control degraded to what is available. Everything runs in ONE transaction and
# commits only if every assertion passes, so a failure leaves the old shape untouched.
#
# 0044 is the first migration in this repo that DROPS columns holding customer data, so it
# carries two assertions the others did not need: the row count is unchanged, and every
# non-empty product name that existed before the fold is still readable after it. A backfill
# that silently produced `{}` for everyone would otherwise commit clean.
#
# It prints PASS/FAIL lines and aggregate counts only. No owner ids, no emails and no
# per-customer text are read into the output.
import sys
import psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
PATH = 'supabase/migrations/0044_product_context_fold.sql'
SQL = open(PATH, encoding='utf-8').read()

conn = psycopg2.connect(URL)
cur = conn.cursor()
fail = []


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('   ' + str(detail)) if detail else ''}")
    if not ok:
        fail.append(label)


# --- BEFORE: what has to survive the fold ------------------------------------------------
cur.execute("select count(*) from public.knowledge_bases")
kbs_before = cur.fetchone()[0]
cur.execute("select count(*) from public.knowledge_bases where product_name <> ''")
named_before = cur.fetchone()[0]
cur.execute("select count(*) from public.knowledge_bases where product_description <> ''")
described_before = cur.fetchone()[0]
print(f'before: {kbs_before} help centers, {named_before} with a product name, '
      f'{described_before} with a description')

cur.execute(SQL)

# --- The column ---------------------------------------------------------------------------
cur.execute("""select data_type, is_nullable, column_default from information_schema.columns
               where table_schema='public' and table_name='knowledge_bases'
                 and column_name='product_context'""")
row = cur.fetchone()
check('product_context exists, jsonb, not null', row is not None and row[0] == 'jsonb' and row[1] == 'NO', row)

cur.execute("""select count(*) from information_schema.columns
               where table_schema='public' and table_name='knowledge_bases'
                 and column_name in ('product_name','product_description','audience','tone',
                                     'product_context_updated_at','product_context_updated_by')""")
check('all six old columns are gone', cur.fetchone()[0] == 0)

# --- The backfill: nothing lost ------------------------------------------------------------
cur.execute("select count(*) from public.knowledge_bases")
check('no rows lost', cur.fetchone()[0] == kbs_before, f'{kbs_before} before')

cur.execute("select count(*) from public.knowledge_bases where coalesce(product_context->>'name','') <> ''")
check('every product name survived', cur.fetchone()[0] == named_before, f'{named_before} before')

cur.execute("select count(*) from public.knowledge_bases where coalesce(product_context->>'description','') <> ''")
check('every description survived', cur.fetchone()[0] == described_before, f'{described_before} before')

cur.execute("""select count(*) from public.knowledge_bases
               where jsonb_typeof(product_context->'notes') <> 'array'""")
check('every row has a notes array', cur.fetchone()[0] == 0)

# --- The write path ------------------------------------------------------------------------
SIG = 'public.set_product_context(uuid,text,text,jsonb)'
OLD = 'public.set_product_context(uuid,text,text,text,text)'

cur.execute("select count(*) from pg_proc where proname='set_product_context'")
check('exactly ONE set_product_context overload', cur.fetchone()[0] == 1,
      'two would mean the old uncapped path survived')

cur.execute(f"select prosecdef from pg_proc where oid='{SIG}'::regprocedure")
check('set_product_context is SECURITY DEFINER', cur.fetchone()[0] is True)

cur.execute(f"select has_function_privilege('authenticated','{SIG}','execute')")
check('authenticated may execute', cur.fetchone()[0] is True)
cur.execute(f"select has_function_privilege('anon','{SIG}','execute')")
check('anon may NOT execute', cur.fetchone()[0] is False)

cur.execute(f"select prosrc from pg_proc where oid='{SIG}'::regprocedure")
src = cur.fetchone()[0]
check('identity from auth.uid(), not an argument', 'auth.uid()' in src and 'p_user_id' not in src)
check('guarded by can_edit_kb()', 'can_edit_kb(p_kb_id)' in src)
check('budget enforced in the body', 'context_char_budget()' in src)
check('budget sums notes, not just the description',
      "n->>'title'" in src and "n->>'body'" in src)

cur.execute("select public.context_char_budget()")
check('budget is 6000', cur.fetchone()[0] == 6000)

cur.execute("select count(*) from pg_proc where proname='product_context_cap'")
check('the old 600 cap function is gone', cur.fetchone()[0] == 0)

# --- The grant: product_context must NOT be client-writable --------------------------------
# The whole point of the fold keeping 0040's control. RLS is row-level and cannot express
# column scope (§10e.2), so this is the mechanism, and it is worth asserting rather than
# assuming it inherited.
for role in ('authenticated', 'anon'):
    cur.execute("select has_column_privilege(%s,'public.knowledge_bases','product_context','update')", (role,))
    check(f'{role} may NOT update product_context directly', cur.fetchone()[0] is False)

cur.execute("select has_column_privilege('authenticated','public.knowledge_bases','product_context','select')")
check('authenticated may still READ it', cur.fetchone()[0] is True)

if fail:
    conn.rollback()
    print('\nROLLED BACK: ' + ', '.join(fail))
    sys.exit(1)
conn.commit()
print('\nCOMMITTED 0044')
