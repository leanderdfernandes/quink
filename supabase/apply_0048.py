# Apply 0048 (audience + tone restored to product_context) transactionally, with assertions.
#
#     python supabase/apply_0048.py
#
# CLAUDE.md §10m says staging first, then production. THAT DOES NOT HAPPEN HERE: .env carries
# one SUPABASE_DB_URL and there is no staging project reachable from this machine -- the same
# standing exception 0042-0047 were applied under. The mitigation is this script: every
# assertion runs inside the transaction and any failure rolls the whole thing back, so the
# worst case is a no-op, not a half-applied schema.
#
# This migration DROPS AND RECREATES a function, which is the exact class §10m and §10j's
# last bullet exist to guard (0024 lost the watermark clause this way). So the checks below
# do more than confirm the new arguments exist: they re-prove every property of the live
# body that must survive -- the definer flag, the search_path pin, the identity gate, the
# editor gate, the budget, the caps and the grants -- and they assert the OLD four-argument
# overload is gone, because two write paths where one cannot set the new keys is how a stale
# client silently blanks them on every save.
import sys
import psycopg2

URL = [l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('SUPABASE_DB_URL')][0]
PATH = 'supabase/migrations/0048_product_context_voice.sql'
SQL = open(PATH, encoding='utf-8').read()

conn = psycopg2.connect(URL)
cur = conn.cursor()
fail = []


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('   ' + str(detail)) if detail else ''}")
    if not ok:
        fail.append(label)


# --- BEFORE ------------------------------------------------------------------------------
# The live body, printed and kept, so the diff in the migration header is observed rather
# than assumed. Anything the new body must still contain is asserted against this copy.
cur.execute("""select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'set_product_context'""")
before = cur.fetchall()
print(f'live overloads before: {[sig for sig, _ in before]}')
check('exactly one live overload to replace', len(before) == 1, [s for s, _ in before])
before_body = before[0][1] if before else ''

cur.execute("select count(*) from public.knowledge_bases")
kb_count = cur.fetchone()[0]
cur.execute("select count(*) from public.knowledge_bases where product_context ? 'name'")
named_before = cur.fetchone()[0]

# --- APPLY -------------------------------------------------------------------------------
# The file carries its own begin/commit; psycopg2 already opened a transaction, so strip
# them and let this script's single transaction be the one that counts.
cur.execute(SQL.replace('\nbegin;\n', '\n').replace('\ncommit;\n', '\n'))

# --- AFTER: the signature ----------------------------------------------------------------
cur.execute("""select p.oid::regprocedure::text from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'set_product_context'""")
# regprocedure renders the argument list without spaces, so compare with spaces stripped --
# an endswith() against a prettified signature silently matches nothing and passes vacuously.
sigs = [r[0] for r in cur.fetchall()]
tight = [s.replace(' ', '') for s in sigs]
check('exactly one overload after', len(sigs) == 1, sigs)
check('the old 4-arg overload is gone',
      not any(s.endswith('(uuid,text,text,jsonb)') for s in tight), sigs)
check('new signature takes audience and tone',
      any(s.endswith('(uuid,text,text,jsonb,text,text)') for s in tight), sigs)

SIG = 'public.set_product_context(uuid, text, text, jsonb, text, text)'
cur.execute(f"select pg_get_functiondef('{SIG}'::regprocedure)")
body = cur.fetchone()[0]

# --- AFTER: every property of the old body that must survive ------------------------------
cur.execute(f"""select prosecdef, proconfig, pronargdefaults
                  from pg_proc where oid = '{SIG}'::regprocedure""")
secdef, config, ndefaults = cur.fetchone()
check('still SECURITY DEFINER', secdef is True)
check('still pins search_path = public', config == ['search_path=public'], config)
check('four parameters carry defaults (a stale 3-arg client still works)',
      ndefaults == 4, ndefaults)

for label, needle in [
    ('identity from auth.uid(), not an argument (§10e.1)', 'auth.uid()'),
    ('editor gate, not owner gate (§10j)', 'can_edit_kb(p_kb_id)'),
    ('name still required', 'product name is required'),
    ('name still capped at 120', 'length(v_name) > 120'),
    ('50-note ceiling survives', 'jsonb_array_length(v_notes) > 50'),
    ('note normalisation survives', 'gen_random_uuid()::text'),
    ('budget still enforced server-side', 'context_char_budget()'),
    ('budget still rejects rather than truncates', 'over the % limit'),
    ('who/when stamp survives', "'updated_by',  v_uid"),
    ('audience is stored', "'audience',    v_aud"),
    ('tone is stored', "'tone',        v_tone"),
    ('audience capped at 200', 'length(v_aud) > 200'),
    ('tone capped at 40', 'length(v_tone) > 40'),
]:
    check(label, needle in body)

# THE BUDGET DID NOT SILENTLY GROW A NEW MEMBER. Audience and tone are structural and
# exempt; folding either into v_used would shrink the pool the user was promised and make
# the client meter disagree with the refusal.
used_line = [l for l in body.splitlines() if 'into v_used' in l or 'select length(v_desc)' in l]
check('budget sums description + notes ONLY',
      all('v_aud' not in l and 'v_tone' not in l for l in used_line), used_line)

# --- AFTER: grants -----------------------------------------------------------------------
for role in ('public', 'anon'):
    cur.execute(f"select has_function_privilege(%s, '{SIG}', 'execute')", (role,))
    check(f'{role} may NOT execute set_product_context', cur.fetchone()[0] is False)
cur.execute(f"select has_function_privilege('authenticated', '{SIG}', 'execute')")
check('authenticated MAY execute set_product_context', cur.fetchone()[0] is True)

cur.execute(f"select obj_description('{SIG}'::regprocedure)")
check('function is commented', bool(cur.fetchone()[0]))

# --- AFTER: the column is untouched -------------------------------------------------------
# This migration changes a function, not data. Existing rows keep their shape and simply
# have no audience/tone key until their next save -- productContextOf() reads a missing key
# as '' and the prompt builder omits the line, so nothing has to be backfilled.
cur.execute("select count(*) from public.knowledge_bases")
check('no KB row was added or removed', cur.fetchone()[0] == kb_count)
cur.execute("select count(*) from public.knowledge_bases where product_context ? 'name'")
check('no KB lost its product context', cur.fetchone()[0] == named_before)

cur.execute("""select col_description('public.knowledge_bases'::regclass, ordinal_position)
                 from information_schema.columns
                where table_schema='public' and table_name='knowledge_bases'
                  and column_name='product_context'""")
comment = cur.fetchone()[0]
check('column comment names audience and tone',
      comment and 'audience' in comment and 'tone' in comment, comment)

# product_context must STILL not be client-writable -- the RPC is the only way in, and that
# is the whole reason the budget and the caps above are worth anything (§10e.2).
cur.execute("""select has_column_privilege('authenticated',
                 'public.knowledge_bases','product_context','update')""")
check('authenticated may NOT update product_context directly', cur.fetchone()[0] is False)

# --- The code mirrors ---------------------------------------------------------------------
# The worker never stopped reading these two keys; that is what makes this a no-deploy
# change on the pipeline side, and it is worth asserting rather than remembering.
pr = open('worker/prompts.py', encoding='utf-8').read()
check("worker still reads product['audience']", "product.get(\"audience\")" in pr)
check("worker still reads product['tone']", "product.get(\"tone\")" in pr)
ts = open('web/src/lib/config.ts', encoding='utf-8').read()
check('web AUDIENCE_MAX = 200 matches the RPC cap', 'export const AUDIENCE_MAX = 200' in ts)
check('web CONTEXT_CHAR_BUDGET still 6000', 'export const CONTEXT_CHAR_BUDGET = 6000' in ts)

if fail:
    conn.rollback()
    sys.exit(f'ROLLED BACK — {len(fail)} check(s) failed: {fail}')
conn.commit()
print('0048 applied and committed.')
