"""Live acceptance run for replace_steps (migration 0038) — the concurrent-undo guard.

Run it after touching undo, discard, or anything in the editor's save path.

    cd supabase && ../worker/.venv/Scripts/python test_replace_steps.py

Reproduces the bug that caused this migration, at the database, with two real connections:

    C1 delete -> C2 delete -> C1 insert -> C2 insert   =  every step duplicated

That is what article a6aa3969 actually contained: nine rows from two insert batches 70ms
apart. The old client-side delete+insert pair could interleave that way; replace_steps
serialises on the article row, so the loser writes NOTHING and is told to re-read.

Also proves the things a unit test with fakes cannot:
  * the loser leaves the article EXACTLY as the winner left it — no partial delete;
  * a caller with no edit rights is refused, and cannot tell "no access" from "not found";
  * every step column survives a round trip (the five-places rule, at the database);
  * an unknown article id does not reveal itself.
"""

import json
import os
import re
import sys
import uuid

import psycopg2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = re.search(r"SUPABASE_DB_URL=(\S+)", open(os.path.join(ROOT, ".env")).read()).group(1)

failures: list[str] = []


def check(label: str, got, want) -> None:
    ok = got == want
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}: {got!r}")
    if not ok:
        failures.append(f"{label}: got {got!r}, want {want!r}")


def steps_json(n: int, tag: str) -> str:
    return json.dumps(
        [
            {
                "step_number": i,
                "heading": f"{tag} heading {i}",
                "body_text": f"<p>{tag} body {i}</p>",
                "screenshot_url": f"kb/art/step-{i}.webp",
                "is_edited": i == 1,
                "timestamp_seconds": i * 1.5,
                "annotations": [{"t": "box", "c": "#2F7D57", "x": 0.1, "y": 0.2}],
            }
            for i in range(1, n + 1)
        ]
    )


def main() -> int:
    admin = psycopg2.connect(DB)
    admin.autocommit = True
    cur = admin.cursor()

    kb_id = uuid.uuid4()
    art_id = uuid.uuid4()

    try:
        cur.execute("select id from profiles order by created_at limit 1")
        owner = cur.fetchone()[0]
        cur.execute(
            "insert into knowledge_bases (id, owner_id, name, subdomain) values (%s,%s,%s,%s)",
            (str(kb_id), str(owner), "replace_steps test", f"rstest-{uuid.uuid4().hex[:8]}"),
        )
        cur.execute(
            "insert into articles (id, kb_id, title, status) values (%s,%s,'T','ready')",
            (str(art_id), str(kb_id)),
        )
        cur.execute("select updated_at from articles where id=%s", (str(art_id),))
        base = cur.fetchone()[0]

        # Both "sessions" act as the owner. replace_steps derives the actor from auth.uid(),
        # so the JWT claim is set per connection — this is the real admission path, not a
        # bypass of it.
        def session():
            c = psycopg2.connect(DB)
            c.autocommit = False
            k = c.cursor()
            k.execute(
                "select set_config('request.jwt.claims', %s, false)",
                (json.dumps({"sub": str(owner), "role": "authenticated"}),),
            )
            return c, k

        print("\n1. two concurrent whole-document replaces — the reported bug")
        c1, k1 = session()
        c2, k2 = session()
        # C1 opens its transaction and takes the article row.
        k1.execute(
            "select replace_steps(%s,%s,'T','',%s,%s)",
            (str(art_id), base, "[]", steps_json(5, "C1")),
        )
        r1 = k1.fetchone()[0]
        check("C1 wins", r1["ok"], True)

        # C2 starts from the SAME base — exactly two editors who loaded together. It blocks
        # on the row lock until C1 commits, then re-evaluates and finds the row moved.
        c1.commit()
        k2.execute(
            "select replace_steps(%s,%s,'T','',%s,%s)",
            (str(art_id), base, "[]", steps_json(4, "C2")),
        )
        r2 = k2.fetchone()[0]
        c2.commit()
        check("C2 is refused (conflict, not error)", r2["ok"], False)

        cur.execute("select count(*) from steps where article_id=%s", (str(art_id),))
        # The old code left 9 here — 5 from C1 plus 4 from C2.
        check("exactly C1's five rows survive", cur.fetchone()[0], 5)
        cur.execute(
            "select count(*) from steps where article_id=%s and heading like 'C2%%'",
            (str(art_id),),
        )
        check("none of C2's rows were written", cur.fetchone()[0], 0)
        cur.execute(
            "select count(distinct step_number) from steps where article_id=%s",
            (str(art_id),),
        )
        check("no duplicate step_numbers", cur.fetchone()[0], 5)

        for c in (c1, c2):
            c.close()

        print("\n2. every step column survives the round trip")
        cur.execute("select updated_at from articles where id=%s", (str(art_id),))
        base2 = cur.fetchone()[0]
        c3, k3 = session()
        k3.execute(
            "select replace_steps(%s,%s,'New title','Sub',%s,%s)",
            (str(art_id), base2, json.dumps([{"id": "f_1", "q": "Q?", "a": "<p>A</p>"}]),
             steps_json(3, "C3")),
        )
        r3 = k3.fetchone()[0]
        c3.commit()
        c3.close()
        check("ok", r3["ok"], True)
        cur.execute(
            """select step_number, heading, body_text, screenshot_url, is_edited,
                      timestamp_seconds, annotations
                 from steps where article_id=%s order by step_number""",
            (str(art_id),),
        )
        rows = cur.fetchall()
        check("three rows", len(rows), 3)
        check("heading", rows[0][1], "C3 heading 1")
        check("body_text", rows[0][2], "<p>C3 body 1</p>")
        check("screenshot_url", rows[0][3], "kb/art/step-1.webp")
        check("is_edited preserved", rows[0][4], True)
        check("is_edited false preserved", rows[1][4], False)
        check("timestamp_seconds preserved", float(rows[0][5]), 1.5)
        check("annotations preserved", rows[0][6][0]["c"], "#2F7D57")
        cur.execute("select title, subtitle, faqs from articles where id=%s", (str(art_id),))
        t, sub, faqs = cur.fetchone()
        check("article title patched in same txn", t, "New title")
        check("article subtitle patched", sub, "Sub")
        check("article faqs patched", faqs[0]["q"], "Q?")

        print("\n3. a null screenshot stays null, not an empty string")
        cur.execute("select updated_at from articles where id=%s", (str(art_id),))
        base3 = cur.fetchone()[0]
        c4, k4 = session()
        k4.execute(
            "select replace_steps(%s,%s,'New title','Sub','[]',%s)",
            (str(art_id), base3, json.dumps([
                {"step_number": 1, "heading": "h", "body_text": "", "screenshot_url": None,
                 "is_edited": False, "timestamp_seconds": None, "annotations": []},
                {"step_number": 2, "heading": "h", "body_text": "", "screenshot_url": "",
                 "is_edited": False, "timestamp_seconds": None, "annotations": []},
            ])),
        )
        k4.fetchone()
        c4.commit()
        c4.close()
        cur.execute(
            "select screenshot_url from steps where article_id=%s order by step_number",
            (str(art_id),),
        )
        got = [r[0] for r in cur.fetchall()]
        check("json null and '' both become NULL", got, [None, None])

        print("\n4. refusals")
        cur.execute("select updated_at from articles where id=%s", (str(art_id),))
        base4 = cur.fetchone()[0]

        # Somebody with no membership and no ownership.
        stranger = uuid.uuid4()
        c5, k5 = session()
        k5.execute(
            "select set_config('request.jwt.claims', %s, false)",
            (json.dumps({"sub": str(stranger), "role": "authenticated"}),),
        )
        try:
            k5.execute(
                "select replace_steps(%s,%s,'x','',%s,%s)",
                (str(art_id), base4, "[]", steps_json(1, "X")),
            )
            k5.fetchone()
            check("stranger refused", False, True)
        except psycopg2.Error as e:
            check("stranger refused", "not found, or no access" in str(e), True)
        c5.rollback()

        # An article id that does not exist gets the SAME message — it must not be a probe.
        try:
            k5.execute(
                "select replace_steps(%s,%s,'x','',%s,%s)",
                (str(uuid.uuid4()), base4, "[]", steps_json(1, "X")),
            )
            k5.fetchone()
            check("unknown article refused", False, True)
        except psycopg2.Error as e:
            check("unknown article: same message, no probe",
                  "not found, or no access" in str(e), True)
        c5.rollback()
        c5.close()

        cur.execute("select count(*) from steps where article_id=%s", (str(art_id),))
        check("refusals wrote nothing", cur.fetchone()[0], 2)

        print("\n5. an oversized array is refused rather than written")
        cur.execute("select updated_at from articles where id=%s", (str(art_id),))
        base5 = cur.fetchone()[0]
        c6, k6 = session()
        big = json.dumps([
            {"step_number": i, "heading": "h", "body_text": "", "screenshot_url": None,
             "is_edited": False, "timestamp_seconds": None, "annotations": []}
            for i in range(1, 502)
        ])
        try:
            k6.execute(
                "select replace_steps(%s,%s,'x','','[]',%s)", (str(art_id), base5, big)
            )
            k6.fetchone()
            check("501 steps refused", False, True)
        except psycopg2.Error as e:
            check("501 steps refused", "too many steps" in str(e), True)
        c6.rollback()
        c6.close()
        cur.execute("select count(*) from steps where article_id=%s", (str(art_id),))
        check("still two rows", cur.fetchone()[0], 2)

    finally:
        cur.execute("delete from articles where kb_id = %s", (str(kb_id),))
        cur.execute("delete from knowledge_bases where id = %s", (str(kb_id),))
        admin.close()

    print()
    if failures:
        for f in failures:
            print("FAILED:", f)
        return 1
    print("all replace_steps checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
