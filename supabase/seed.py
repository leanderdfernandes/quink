"""Seed demo data so every flow is exercisable the moment the repo runs (build spec).

Creates, on the first existing KB: a theme, a demo folder, and one article in EACH
publish state — draft (404s), unlisted (link-only), listed (in nav/search/sitemap).
Idempotent: it replaces its own rows (everything filed in the SEED_FOLDER) on every run
and touches nothing else.

Run:  python supabase/seed.py         (reads SUPABASE_DB_URL from ./.env)

Prereq: at least one signed-up user (a KB auto-provisions on signup). Local Supabase or a
remote DB both work — it only needs the connection string.
"""

import json
import sys
from pathlib import Path

import psycopg

# The seed files all its articles in one folder (migration 0009). That folder doubles as
# the idempotency marker: every run wipes and refills it, leaving real user folders alone.
SEED_FOLDER = "Getting started"


def db_url() -> str:
    env = Path(__file__).resolve().parent.parent / ".env"
    for line in env.read_text().splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip()
    sys.exit("SUPABASE_DB_URL not found in .env")


def steps(*pairs: tuple[str, str]) -> list[dict]:
    return [
        {"step_number": i + 1, "heading": h, "body_text": b, "screenshot_url": None}
        for i, (h, b) in enumerate(pairs)
    ]


def content(title: str, subtitle: str, s: list[dict]) -> dict:
    return {"title": title, "subtitle": subtitle, "steps": s}


DEMOS = [
    {
        "visibility": "listed",
        "slug": "invite-your-team",
        "title": "Invite your team",
        "subtitle": "Add teammates and set what they can do.",
        "steps": steps(
            ("Open Settings", "<p>Click the gear icon, then choose <b>Members</b>.</p>"),
            ("Send an invite", "<p>Enter an email address and click <b>Invite</b>.</p>"),
            ("Pick a role", "<p>Choose <b>Editor</b> or <b>Viewer</b>, then save.</p>"),
        ),
    },
    {
        "visibility": "unlisted",
        "slug": "beta-billing-guide",
        "title": "Billing (beta)",
        "subtitle": "A link-only guide we haven't listed yet.",
        "steps": steps(
            ("Open Billing", "<p>Go to <b>Settings → Billing</b>.</p>"),
            ("Add a card", "<p>Enter your card details and click <b>Save</b>.</p>"),
        ),
    },
    {
        "visibility": "draft",
        "slug": "unpublished-draft",
        "title": "A work in progress",
        "subtitle": "Still a draft — its URL should 404.",
        "steps": steps(("First step", "<p>Not published yet.</p>")),
    },
]


def main() -> None:
    with psycopg.connect(db_url(), autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("select id, subdomain from public.knowledge_bases order by created_at limit 1")
        row = cur.fetchone()
        if not row:
            sys.exit("No KB found. Sign up in the app first, then re-run the seed.")
        kb_id, subdomain = row

        # A theme, so the reader looks styled out of the box.
        cur.execute(
            "update public.knowledge_bases set primary_color=%s, font_pairing=%s, about=%s where id=%s",
            (
                "#2563EB",
                "editorial",
                "Guides and answers for getting the most out of our product. "
                "Search above or browse the articles below.",
                kb_id,
            ),
        )

        # Find-or-create the demo folder; it's both a live-site category and our marker.
        cur.execute(
            "select id from public.folders where kb_id=%s and name=%s", (kb_id, SEED_FOLDER)
        )
        r = cur.fetchone()
        if r:
            folder_id = r[0]
        else:
            cur.execute(
                "insert into public.folders (kb_id, name, position) values (%s,%s,0) returning id",
                (kb_id, SEED_FOLDER),
            )
            folder_id = cur.fetchone()[0]

        # Replace only our own seed rows (everything in the seed folder).
        cur.execute("delete from public.articles where kb_id=%s and folder_id=%s", (kb_id, folder_id))

        for d in DEMOS:
            published = d["visibility"] != "draft"
            c = content(d["title"], d["subtitle"], d["steps"])
            cur.execute(
                """insert into public.articles
                     (kb_id, title, subtitle, status, visibility, slug, folder_id,
                      published_content, published_at)
                   values (%s,%s,%s,%s,%s,%s,%s,%s, case when %s then now() else null end)
                   returning id""",
                (
                    kb_id, d["title"], d["subtitle"],
                    "published" if published else "ready",
                    d["visibility"], d["slug"], folder_id,
                    json.dumps(c) if published else None,
                    published,
                ),
            )
            article_id = cur.fetchone()[0]
            for st in d["steps"]:
                cur.execute(
                    """insert into public.steps (article_id, step_number, heading, body_text)
                       values (%s,%s,%s,%s)""",
                    (article_id, st["step_number"], st["heading"], st["body_text"]),
                )

        print(f"Seeded KB {subdomain} ({kb_id}) with 3 demo articles (listed/unlisted/draft).")
        print(f"Reader:  /kb/{subdomain}")


if __name__ == "__main__":
    main()
