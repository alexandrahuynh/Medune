# Medune MVP Data Ingestion

This repo contains the PostgreSQL schema and a conservative ingestion script.
It also includes a small Node/Express backend for MVP medication search.

The scraper/importer is intentionally review-first:

- MVP starter rules can be inserted directly after review.
- Public-source records are staged as `pending_review`.
- The script doesn't generate clinical recommendations from scraped text.
- Only `approved` rules should be used by the risk engine.

## Run with Docker (local dev stack)

The fastest way to run the whole app — PostgreSQL, the backend, and the
frontend — without installing Node, Python, or PostgreSQL locally. Requires
[Docker Desktop](https://docs.docker.com/get-docker/) (or Docker Engine +
Compose v2).

Start the stack:

```bash
docker compose up --build
```

This starts three services and applies `db/schema.sql` on first boot:

- Frontend (Vite dev server, hot reload): http://localhost:5173
- Backend (medication search API): http://localhost:4000
- PostgreSQL: internal to the compose network

Seed the MVP medication data (one-time, or after resetting the database). Run
it in a second terminal while the stack is up:

```bash
docker compose --profile pipeline run --rm pipeline
```

This runs the ingestion script's `--seed-mvp` step. After it finishes, the
search API returns results, e.g. http://localhost:4000/api/medications/search?q=clopidogrel

Useful commands:

```bash
docker compose exec db psql -U medune -d medune   # inspect the database
docker compose logs -f backend                    # follow backend logs
docker compose down                               # stop and remove containers
docker compose down -v                            # also wipe the database volume
```

Notes:

- Ports are published to `127.0.0.1` only, so nothing is exposed to your LAN.
  Inside its container the backend binds `0.0.0.0` (required for Docker
  networking); the guard in `backend/server.js` permits this while still
  rejecting arbitrary LAN addresses.
- Source directories are bind-mounted, so edits to `backend/` and `frontend/`
  hot-reload without rebuilding.
- To override the database credentials or name, copy `.env.example` to `.env`
  and edit it (compose reads `.env` automatically).

The manual, host-based setup below is still supported.

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

## Authenticated Medication List

Signed-in users can search the three MVP medications and add several of them to
`My medications`. The list is stored in PostgreSQL's existing
`patient_medications` table. The row UUID is the stable list-item identifier;
the `(patient_id, medication_id)` unique constraint prevents duplicates across
sessions. Users can remove an item or edit the fields supported by the current
model: status (`active`, `past`, or `considering`) and an optional note of up to
500 characters.

Medication and PGx endpoints derive the patient from a hashed server-side
session; the client does not send an authority-bearing patient ID. Registration
stores a scrypt password hash, login creates a random 12-hour token in an
HttpOnly SameSite cookie, and logout revokes it. Production cookies are also
`Secure`. Apply `db/schema.sql` before using this workflow.

### Medication safety data

The repository has no clinically reviewed, versioned adverse-reaction dataset.
Medune therefore does not display fixture side effects, urgency advice, numeric
generalized risk scores, or generalized risk labels. The provider returns
`score: null`, `level: unknown`, and `label: Not evaluated`.

Side-effect presentation and generalized medication-risk ratings are deferred
requirements, not completed clinical features.

Before side effects can be enabled, every record must include exact versioned
provenance, incidence context, reviewer identity, review date, and approval
status.

### Medication-list API

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/patients/me/medications
POST   /api/patients/me/medications
PATCH  /api/patients/me/medications/:itemId
DELETE /api/patients/me/medications/:itemId
```

Apply `db/schema.sql` to older local databases before using the feature. The
migration adds a nullable password hash to existing users and creates the
session table without deleting existing data. Preserve passwordless users and
their existing patient data by setting `MEDUNE_ENROLL_EMAIL` and
`MEDUNE_ENROLL_PASSWORD`, then running `npm.cmd run enroll:user` from `backend`.

For an existing database, apply
`db/migrations/002_auth_and_patient_uniqueness.sql`. It consolidates duplicate
patient rows into the oldest patient for each user, merges PGx and medication
records, repoints risk history, and then enforces one patient per user. Review a
database backup before applying any production migration.

The frontend bootstraps authentication exclusively through `GET /api/auth/me`;
localStorage is not an authentication source. State-changing requests require
the configured frontend `Origin` and a session-bound `X-CSRF-Token`. Login and
registration have in-process IP/account throttling; distributed deployments
should use a shared rate-limit store.

Run relevant validation:

```powershell
cd backend
npm.cmd test
# Set TEST_DATABASE_URL to include the PostgreSQL-backed HTTP integration test.
$env:TEST_DATABASE_URL = "postgres://.../medune_integration"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm.cmd test
cd ..\frontend
npm.cmd run lint
npm.cmd run build
cd ..\scripts
..\.venv\Scripts\python.exe -m unittest test_ingest_pipeline.py
```

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
