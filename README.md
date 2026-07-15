# Medune MVP Data Ingestion

This repo contains the PostgreSQL schema and a conservative ingestion script.
It also includes a small Node/Express backend for MVP medication search.

The scraper/importer is intentionally review-first:

- MVP starter rules can be inserted directly after review.
- Public-source records are staged as `pending_review`.
- The script doesn't generate clinical recommendations from scraped text.
- Only `approved` rules should be used by the risk engine.

## Python Ingestion Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
createdb medune
psql medune -f db/schema.sql
```

Set `DATABASE_URL` in `.env` to your local PostgreSQL connection string. Do not commit `.env`.

```text
DATABASE_URL=
MEDUNE_INGEST_USER_AGENT=MeduneMVPIngestion/0.1 contact=configure-user-agent
```

## Load MVP Starter Rules

Insert the expanded MVP phenotype rules as `pending_review`:

```powershell
python scripts\ingest_medune_mvp_data.py --seed-mvp
```

After qualified clinical review, insert or update them as `approved`:

```powershell
python scripts\ingest_medune_mvp_data.py --seed-mvp --mark-approved
```

## Stage Public-Source Candidates

CPIC provides a public gene-drug pair workbook. This identifies relevant pairs, so the importer stages records as `pending_review`.

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

## MVP Scraper/Collector Pipeline

The MVP pipeline is conservative and review-first. The current collector is a curated static collector for the three MVP medication/rule candidates. Normalized records default to `pending_review`.

1. Collect raw source data:

```powershell
python scripts\ingest_medune_mvp_data.py --collect-mvp --output data\raw\mvp_medication_sources.json
```

2. Normalize records:

```powershell
python scripts\ingest_medune_mvp_data.py --normalize data\raw\mvp_medication_sources.json --output data\normalized\mvp_medune_records.json
```

3. Dry-run review without PostgreSQL:

```powershell
python scripts\ingest_medune_mvp_data.py --dry-run --input data\normalized\mvp_medune_records.json
```

4. Optionally ingest normalized records into PostgreSQL:

```powershell
$env:DATABASE_URL = "<local-or-hosted-postgres-connection-string>"
python scripts\ingest_medune_mvp_data.py --ingest-normalized data\normalized\mvp_medune_records.json
cd backend
npm.cmd run verify:mvp-data
```

5. Run the search API after verification:

```powershell
npm.cmd run dev
```

Generated files under `data\raw`, `data\normalized`, and `data\review` are ignored by Git. Curated sample fixtures may live under `data\samples`.

## Supported MVP Scope

The importer only normalizes these MVP medications:

- clopidogrel / Plavix / CYP2C19
- citalopram / Celexa / CYP2C19
- simvastatin / Zocor / SLCO1B1

Supported starter phenotypes:

- CYP2C19: poor, intermediate, normal, rapid, and ultrarapid metabolizer
- SLCO1B1: normal function, possible decreased function, decreased function, poor function

## Backend Medication Search API

The backend exposes a minimal medication search endpoint for the current MVP:

```text
GET /api/medications/search?q=<query>
```

It searches active rows in the `medications` table by generic or brand name and returns the medication `id` needed by the future rule engine.

### Install Backend Dependencies

```powershell
cd backend
npm install
```

If PowerShell blocks `npm`, use:

```powershell
npm.cmd install
```

### Configure Backend Environment

Copy `backend\.env.example` to `backend\.env` and set `DATABASE_URL` to your local PostgreSQL connection string:

```text
DATABASE_URL=
PORT=4000
HOST=127.0.0.1
FRONTEND_ORIGIN=http://localhost:5173
```

Do not commit real credentials.

### Seed MVP Medications

The medication search API reads from PostgreSQL. If your database is empty, run the schema and ingestion script first:

```powershell
cd ..
psql medune -f db/schema.sql
python scripts\ingest_medune_mvp_data.py --seed-mvp
```

The seed command inserts the expanded CYP2C19 and SLCO1B1 phenotype rules as `pending_review`, and also upserts the MVP medication rows as active medications.

### Verify MVP Database Readiness

Run the backend verifier after applying the schema and seeding MVP data:

```powershell
cd backend
npm.cmd run verify:mvp-data
```

The verifier checks required tables, the three MVP medications, active medication status, medication IDs, and the required MVP starter drug-gene rules. It uses `DATABASE_URL` from `backend\.env` and does not print the database URL.

### Run Backend

```powershell
cd backend
npm run dev
```

The backend binds only to `127.0.0.1` by default. Do not set `HOST` to `0.0.0.0` or a LAN address for local MVP testing.

Health check:

```powershell
Invoke-RestMethod "http://localhost:4000/health"
```

Manual search checks:

```powershell
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=clopidogrel"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=Plavix"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=PLAVIX"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=citalopram"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=Celexa"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=simvastatin"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=Zocor"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q=Adderall"
Invoke-RestMethod "http://localhost:4000/api/medications/search?q="
```

Database checks:

```powershell
psql medune -c "\dt medications"
psql medune -c "SELECT id, generic_name, brand_name, drug_class, is_active FROM medications WHERE lower(generic_name) IN ('clopidogrel', 'citalopram', 'simvastatin') ORDER BY generic_name;"
```

## Windows Database Setup Checklist

Use this checklist on a Windows PowerShell machine with PostgreSQL installed locally.

Create backend environment file:

```powershell
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```

In `backend\.env`, set `DATABASE_URL` to your local PostgreSQL connection string. Keep `HOST=127.0.0.1` for loopback-only backend development. Do not commit `backend\.env`.

Create the database and apply the schema:

```powershell
createdb medune
psql medune -f db\schema.sql
```

If `createdb` or `psql` is not available, add PostgreSQL's `bin` folder to your PATH or run the same SQL through your local PostgreSQL GUI.

Create the Python environment and seed MVP data:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "<your-local-postgres-connection-string>"
python scripts\ingest_medune_mvp_data.py --seed-mvp
```

Verify database readiness:

```powershell
cd backend
npm.cmd install
npm.cmd run verify:mvp-data
```

Run the backend and manually test search:

```powershell
npm.cmd run dev
```

In a second PowerShell window:

```powershell
Invoke-RestMethod "http://127.0.0.1:4000/health"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q=clopidogrel"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q=Plavix"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q=PLAVIX"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q=Celexa"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q=Zocor"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q=Adderall"
Invoke-RestMethod "http://127.0.0.1:4000/api/medications/search?q="
```

## Frontend

Install and run the Vite React frontend:

```powershell
cd frontend
npm install
npm run dev
```

The frontend dev server script binds to `127.0.0.1`.

By default, the frontend calls `http://localhost:4000`. To override that URL, create `frontend\.env`:

```text
VITE_API_BASE_URL=http://localhost:4000
```
