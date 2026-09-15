-- ---------------------------------------------------------------------------
-- Private storage bucket for generated buyer packs.
--
-- Objects are written by the Stripe webhook using the service role and handed
-- to the buyer as a signed URL with a 7-day TTL. No storage policies are
-- created for anon/authenticated, so the bucket is unreachable without a
-- signature.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-exports',
  'order-exports',
  false,
  52428800,                     -- 50 MB ceiling; a 500-row pack is a few hundred KB
  array['text/csv']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
