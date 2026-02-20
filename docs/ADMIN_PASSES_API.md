# Admin Passes API

## Endpoint

`GET /api/admin/passes?type=<type>&page=1&pageSize=50&from=&to=&includeSummary=1`

- **type** (required): `day_pass` | `group_events` | `proshow` | `sana_concert`
- **page**, **pageSize**: pagination (default 50 per page)
- **from**, **to**: optional date range on `createdAt` (ISO date strings)
- **includeSummary**: when `1`, response includes aggregate counts and revenue for the filtered set (used for summary cards on first page)

## Firestore index

For queries with date range, ensure a composite index exists on the `passes` collection:

- **Collection**: `passes`
- **Fields**: `passType` (Ascending), `createdAt` (Descending)

If the index is missing, Firestore will return an error with a link to create it in the Firebase console.
