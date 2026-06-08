# Sample data

Demo complaint files for the Ingestion Panel. Drag any of these into the dashboard
(**＋ Ingest Complaints**) to feed the AI pipeline. Ingestion accepts **only `.csv`
and `.pdf`**, and both must follow the structure below or they are rejected with a reason.

## Files

| File | Type | Coverage |
|---|---|---|
| `complaints.csv` | CSV (20) | Bandra, Whitefield, Delhi North, OMR Chennai, Hyderabad Old City, Kothrud |
| `complaints_multi_city.csv` | CSV (19) | Andheri, MG Road, Electronic City, Anna Nagar, Salt Lake, HITEC City, Hinjewadi, SG Road, Jaipur |
| `complaints_hinjewadi_outage.csv` | CSV (7) | Concentrated outage on Hinjewadi Pune — drives that one tower critical |
| `complaint_bandra.pdf` | PDF | Bandra Mumbai — critical network outage |
| `complaint_whitefield.pdf` | PDF | Whitefield Bengaluru — slow internet (high) |
| `complaint_delhi.pdf` | PDF | Delhi North — call drops (medium) |

`genpdf.cjs` regenerates all three PDFs: `node genpdf.cjs`.

## Required CSV format

Header row **must** contain `complaint` and `location` (`phone` optional):

```csv
complaint,location,phone
"No network signal since this morning",Bandra Mumbai,9820011001
```

- `complaint` — non-empty complaint text (classified by the AI).
- `location` — **must contain a known city/area** (see below) so it can be mapped
  and correlated to a tower. Unknown locations (e.g. "Goa") are rejected per row.
- `phone` — optional sender id.

## Required PDF format

A complaint report containing a **`Location:`** (or `Service Area:`) field whose value
is a known city/area, plus the complaint text. Free-form PDFs without a location field
are rejected. See any `complaint_*.pdf` (or `genpdf.cjs`) for the template.

## Known locations

Complaints must reference one of these areas (each maps to a seeded tower):

> Delhi · Delhi North · Delhi South · Mumbai · Andheri · Bandra · Navi Mumbai ·
> Bengaluru · MG Road · Whitefield · Electronic City · Chennai · Anna Nagar · OMR ·
> Kolkata · Salt Lake · Howrah · Hyderabad · HITEC City · Old City · Pune · Hinjewadi ·
> Kothrud · Ahmedabad · SG Road · Maninagar · Jaipur

> Tip: to demo complaints in a **new** city, first add a tower there via the map's
> **＋ Add Tower** button — correlation is by proximity, so the new tower will pick up
> nearby complaints automatically (the location string still has to geocode, though).
