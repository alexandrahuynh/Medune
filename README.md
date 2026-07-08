# Medune MVP Data Ingestion

This repo contains the PostgreSQL schema and a conservative ingestion script for the Medune one-week pharmacogenomics MVP.

The scraper/importer is intentionally review-first:

- MVP starter rules can be inserted directly after review.
- Public-source records are staged as `pending_review`.
- The script does not generate clinical recommendations from scraped text.
- Only `approved` rules should be used by the risk engine.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
createdb medune
psql medune -f db/schema.sql
```

Set `DATABASE_URL` in `.env`:

```text
DATABASE_URL=postgresql://localhost:5432/medune
MEDUNE_INGEST_USER_AGENT=MeduneMVPIngestion/0.1 contact=your-email@example.com
```

## Load MVP Starter Rules

Insert the five MVP rules as `pending_review`:

```powershell
python scripts\ingest_medune_mvp_data.py --seed-mvp
```

After qualified clinical review, insert or update them as `approved`:

```powershell
python scripts\ingest_medune_mvp_data.py --seed-mvp --mark-approved
```

## Stage Public-Source Candidates

CPIC provides a public gene-drug pair workbook. This identifies relevant pairs, not final medication recommendations, so the importer stages records as `pending_review`.

```powershell
python scripts\ingest_medune_mvp_data.py --cpic-pairs --review-csv cpic_review.csv
```

To insert staged CPIC candidates into PostgreSQL:

```powershell
python scripts\ingest_medune_mvp_data.py --cpic-pairs
```

For official downloadable CSV/TSV/HTML sources that you have reviewed for terms and robots.txt:

```powershell
python scripts\ingest_medune_mvp_data.py --source-name PharmGKB --source-url "https://example.org/approved-file.tsv"
```

Use `--skip-robots-check` only for official download URLs after confirming the source terms manually.

## Supported MVP Scope

The importer only normalizes these MVP medications:

- clopidogrel / Plavix / CYP2C19
- citalopram / Celexa / CYP2C19
- simvastatin / Zocor / SLCO1B1

Clinical rule text must be reviewed by qualified clinicians before production use. Medune is for medication risk awareness and clinician discussion, not medical advice.
