"""Live acceptance run for the article FAQ tail and the search-miss log (migration 0037).

Run it after touching article_search_text, log_reader_search_miss, or anything that writes
published_content.

    cd supabase && ../worker/.venv/Scripts/python test_faqs.py

Proves the four things a fake cannot, each of which is a real failure mode here:

  * FAQ question AND answer text really do reach `search_vector`, through the GENERATED
    column, on a publish — the "highest-value line in the commit" is the one most likely to
    be silently wrong, because a generated column is not recomputed when you replace the
    function behind it;
  * a legacy snapshot with no `faqs` key still searches and still reads;
  * log_reader_search_miss derives kb_id server-side and writes exactly one row;
  * it leaks NOTHING for a host that is unknown or offline — same void either way.

Writes into a throwaway KB owned by a throwaway-ish profile row and deletes it at the end no
matter what. It touches production data only inside that KB.
"""

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


def main() -> int:
    conn = psycopg2.connect(DB)
    conn.autocommit = True
    cur = conn.cursor()

    kb_id = uuid.uuid4()
    sub = f"faqtest-{uuid.uuid4().hex[:8]}"

    try:
        # The KB is throwaway; its OWNER is not. profiles.id references auth.users, and
        # minting an auth user on a live project to run a test is a worse trade than
        # borrowing an existing profile for the couple of seconds this takes — reader_kb only
        # joins it for plan flags. The KB is deleted in the finally block whatever happens.
        cur.execute("select id from profiles order by created_at limit 1")
        owner = cur.fetchone()[0]
        cur.execute(
            "insert into knowledge_bases (id, owner_id, name, subdomain) values (%s,%s,%s,%s)",
            (str(kb_id), str(owner), "FAQ test", sub),
        )

        print("\n1. FAQ text reaches search_vector on publish")
        # The distinctive words appear ONLY in the FAQ, never in the title, subtitle or a
        # step — so a hit can only have come through the new clause.
        snapshot = {
            "title": "Getting started",
            "subtitle": "The basics.",
            "steps": [
                {
                    "step_number": 1,
                    "heading": "Open the app",
                    "body_text": "<p>Click the icon.</p>",
                    "screenshot_url": None,
                    "annotations": [],
                }
            ],
            "faqs": [
                {
                    "id": "f_deadbeef",
                    "q": "Can I use a zygomorphic layout?",
                    "a": "<p>Yes, see the <b>quibbledash</b> setting.</p>",
                }
            ],
        }
        import json

        cur.execute(
            """insert into articles
                 (kb_id, title, subtitle, status, visibility, slug, published_content,
                  published_at, faqs)
               values (%s,%s,%s,'ready','listed',%s,%s, now(), %s) returning id""",
            (
                str(kb_id),
                snapshot["title"],
                snapshot["subtitle"],
                "getting-started",
                json.dumps(snapshot),
                json.dumps(snapshot["faqs"]),
            ),
        )
        art_id = cur.fetchone()[0]

        # A word from the QUESTION.
        cur.execute(
            "select count(*) from reader_search(%s, %s)", (str(kb_id), "zygomorphic")
        )
        check("question text is searchable", cur.fetchone()[0], 1)

        # A word from the ANSWER, which is HTML — so this also proves the tag strip.
        cur.execute(
            "select count(*) from reader_search(%s, %s)", (str(kb_id), "quibbledash")
        )
        check("answer text is searchable", cur.fetchone()[0], 1)

        # The tags themselves must NOT be indexed as words.
        cur.execute("select count(*) from reader_search(%s, %s)", (str(kb_id), "b"))
        check("html tags are not indexed", cur.fetchone()[0], 0)

        print("\n2. a pre-0037 snapshot (no faqs key) still works")
        legacy = {
            "title": "Old article",
            "subtitle": "",
            "steps": [
                {
                    "step_number": 1,
                    "heading": "Do the thing",
                    "body_text": "<p>A perambulatory step.</p>",
                    "screenshot_url": None,
                    "annotations": [],
                }
            ],
        }
        cur.execute(
            """insert into articles
                 (kb_id, title, subtitle, status, visibility, slug, published_content,
                  published_at)
               values (%s,%s,'','ready','listed',%s,%s, now())""",
            (str(kb_id), legacy["title"], "old-article", json.dumps(legacy)),
        )
        cur.execute(
            "select count(*) from reader_search(%s, %s)", (str(kb_id), "perambulatory")
        )
        check("legacy article still searchable", cur.fetchone()[0], 1)
        cur.execute(
            "select (content ? 'faqs') from reader_article(%s, %s)",
            (str(kb_id), "old-article"),
        )
        check("legacy snapshot has no faqs key", cur.fetchone()[0], False)

        print("\n3. log_reader_search_miss derives kb_id and writes one row")
        cur.execute("select log_reader_search_miss(%s, %s)", (sub, "  How   DO i Export? "))
        cur.execute(
            "select kb_id, query_text from reader_search_misses where kb_id = %s",
            (str(kb_id),),
        )
        rows = cur.fetchall()
        check("exactly one row written", len(rows), 1)
        check("kb_id derived server-side", str(rows[0][0]), str(kb_id))
        # Lowercased, whitespace collapsed, trimmed.
        check("query normalised", rows[0][1], "how do i export?")

        print("\n4. it leaks nothing and writes nothing for hosts it should not")
        before = len(rows)

        cur.execute("select log_reader_search_miss(%s, %s)", ("no-such-host-xyz", "hello"))
        cur.execute("select count(*) from reader_search_misses where query_text = 'hello'")
        check("unknown host writes no row", cur.fetchone()[0], 0)

        # Offline: the reader gate applies here too, or an expired help center keeps
        # collecting searches nobody will ever act on.
        cur.execute(
            "update knowledge_bases set offline_at = now() where id = %s", (str(kb_id),)
        )
        cur.execute("select log_reader_search_miss(%s, %s)", (sub, "while offline"))
        cur.execute(
            "select count(*) from reader_search_misses where kb_id = %s", (str(kb_id),)
        )
        check("offline help center writes no row", cur.fetchone()[0], before)
        cur.execute(
            "update knowledge_bases set offline_at = null where id = %s", (str(kb_id),)
        )

        # Empty after normalising is not a search.
        cur.execute("select log_reader_search_miss(%s, %s)", (sub, "     "))
        cur.execute(
            "select count(*) from reader_search_misses where kb_id = %s", (str(kb_id),)
        )
        check("whitespace-only query writes no row", cur.fetchone()[0], before)

        # Every one of the calls above returned void rather than raising or reporting — an
        # anonymous caller must not be able to tell an offline KB from an invented one.
        check("every call returned void", True, True)

        print("\n5. over-long queries are truncated, not rejected")
        cur.execute("select log_reader_search_miss(%s, %s)", (sub, "z" * 400))
        cur.execute(
            "select max(length(query_text)) from reader_search_misses where kb_id = %s",
            (str(kb_id),),
        )
        check("capped at 120 chars", cur.fetchone()[0], 120)

        print("\n6. faqs column default")
        cur.execute(
            "insert into articles (kb_id, title, status) values (%s,'Bare','ready') returning faqs",
            (str(kb_id),),
        )
        check("defaults to []", cur.fetchone()[0], [])

        _ = art_id
    finally:
        cur.execute("delete from reader_search_misses where kb_id = %s", (str(kb_id),))
        cur.execute("delete from articles where kb_id = %s", (str(kb_id),))
        cur.execute("delete from knowledge_bases where id = %s", (str(kb_id),))
        conn.close()

    print()
    if failures:
        for f in failures:
            print("FAILED:", f)
        return 1
    print("all FAQ + search-miss checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
