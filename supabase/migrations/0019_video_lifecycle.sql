-- Source-video lifecycle: make the promise on the upload screen true.
--
-- Upload.tsx tells every user, before they hand us a screen recording: "We delete the
-- source video once your article is published." Nothing implemented it. This adds the two
-- columns the two collection paths need — publish, and the 7-day sweep for videos whose
-- job failed and therefore will never reach a publish event.

-- ---------------------------------------------------------------------------
-- jobs: remember the video, and whether it has been collected
-- ---------------------------------------------------------------------------
-- The job row is the ONLY place a failed generation's video path can live. articles.
-- source_video_path is no use here: the article is created after Stage 1 succeeds, so a
-- job that dies in ffprobe or in the video model never produces a row to hang the path on,
-- and the upload is stranded in Storage with nothing in the database naming it.
alter table public.jobs
  add column video_path      text,
  -- Marker, not a schedule. The sweep asks "failed, old enough, not yet purged" — so a
  -- missed tick self-heals on the next one and a purged job is never retried.
  add column video_purged_at timestamptz;

comment on column public.jobs.video_path is
  'Storage path of the source recording, recorded at job creation so a FAILED job''s video can still be found and purged. A successful job''s video is collected on first publish instead.';

-- Backfill from the article where one exists, so pre-existing failed jobs are sweepable.
update public.jobs j
   set video_path = a.source_video_path
  from public.articles a
 where a.id = j.article_id
   and a.source_video_path is not null
   and j.video_path is null;

create index jobs_video_purge_idx on public.jobs (created_at)
  where status = 'error' and video_path is not null and video_purged_at is null;
