# Supabase

## Applying migrations

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file in `migrations/` into the SQL editor **in filename order**:

| File | What it does |
| --- | --- |
| `20260101000000_init_tier1.sql` | `companies`, `shipments`, `orders` + indexes |
| `20260101000001_rls.sql` | Row-Level Security posture |
| `20260101000002_ingest_functions.sql` | `ingest_companies` / `ingest_shipments` RPCs |
| `20260101000003_storage.sql` | private `order-exports` bucket |

## Security posture

- `companies` is world-readable — it is what the public search dashboard renders.
- `shipments` and `orders` have **no** anon policies. Only the service role reaches them.
- Buyer-pack CSVs live in a private bucket and are delivered as 7-day signed URLs.

Never ship `SUPABASE_SERVICE_ROLE_KEY` to the browser. It is read only by route
handlers under `src/app/api/**` and by `scripts/ingest_csv.py`.
