import argparse
import csv
import logging
import os
import time
import zipfile
from dataclasses import dataclass
from io import BytesIO, StringIO
from typing import Iterable, Optional
from xml.etree import ElementTree
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import psycopg
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv


load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

DATABASE_URL = os.environ.get("DATABASE_URL")
USER_AGENT = os.environ.get(
    "MEDUNE_INGEST_USER_AGENT",
    "MeduneMVPIngestion/0.1 contact=replace-with-your-email@example.com",
)
RATE_LIMIT_SECONDS = float(os.environ.get("MEDUNE_INGEST_RATE_LIMIT_SECONDS", "1.0"))

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": (
        "text/csv,text/tab-separated-values,application/json,"
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,"
        "text/html;q=0.9,*/*;q=0.8"
    ),
}

CPIC_GENE_DRUG_PAIRS_URL = (
    "https://files.cpicpgx.org/data/report/current/pair/cpic_gene-drug_pairs.xlsx"
)

REVIEW_PENDING = "pending_review"
REVIEW_APPROVED = "approved"

SUPPORTED_MEDICATIONS = {
    "clopidogrel": ("clopidogrel", "Plavix", "antiplatelet"),
    "plavix": ("clopidogrel", "Plavix", "antiplatelet"),
    "citalopram": ("citalopram", "Celexa", "antidepressant"),
    "celexa": ("citalopram", "Celexa", "antidepressant"),
    "simvastatin": ("simvastatin", "Zocor", "statin"),
    "zocor": ("simvastatin", "Zocor", "statin"),
}

PHENOTYPE_ALIASES = {
    "poor metabolizer": "poor metabolizer",
    "intermediate metabolizer": "intermediate metabolizer",
    "normal metabolizer": "normal metabolizer",
    "rapid metabolizer": "rapid metabolizer",
    "ultrarapid metabolizer": "ultrarapid metabolizer",
    "decreased function": "decreased function",
    "possible decreased function": "decreased function",
    "normal function": "normal function",
    "increased function": "increased function",
}

ALLOWED_RISK_LEVELS = {
    "low_risk",
    "caution",
    "potential_concern",
    "insufficient_data",
}


@dataclass(frozen=True)
class MedicationRecord:
    generic_name: str
    brand_name: Optional[str]
    drug_class: Optional[str]


@dataclass(frozen=True)
class RuleRecord:
    medication_generic_name: str
    brand_name: Optional[str]
    drug_class: Optional[str]
    gene: str
    phenotype: str
    risk_level: str
    patient_summary: str
    clinician_summary: str
    recommended_action: str
    evidence_source: str
    evidence_url: str
    rule_version: str
    review_status: str = REVIEW_PENDING


def normalize_text(value: Optional[str]) -> str:
    return " ".join((value or "").strip().split())


def normalize_key(value: Optional[str]) -> str:
    return normalize_text(value).lower()


def normalize_gene(value: str) -> str:
    return normalize_text(value).upper()


def normalize_medication(value: str) -> Optional[MedicationRecord]:
    item = SUPPORTED_MEDICATIONS.get(normalize_key(value))
    if not item:
        return None
    generic_name, brand_name, drug_class = item
    return MedicationRecord(generic_name, brand_name, drug_class)


def normalize_phenotype(value: str) -> Optional[str]:
    return PHENOTYPE_ALIASES.get(normalize_key(value))


def require_database_url() -> str:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required. Example: postgresql://localhost:5432/medune")
    return DATABASE_URL


def validate_rule(rule: RuleRecord) -> None:
    if rule.risk_level not in ALLOWED_RISK_LEVELS:
        raise ValueError(f"Invalid risk level: {rule.risk_level}")
    if rule.review_status not in {REVIEW_PENDING, REVIEW_APPROVED, "rejected"}:
        raise ValueError(f"Invalid review status: {rule.review_status}")


def approved_status(mark_approved: bool) -> str:
    return REVIEW_APPROVED if mark_approved else REVIEW_PENDING


def get_manual_mvp_rules(mark_approved: bool = False) -> list[RuleRecord]:
    status = approved_status(mark_approved)
    evidence_url = "https://cpicpgx.org/guidelines/"

    return [
        RuleRecord(
            medication_generic_name="clopidogrel",
            brand_name="Plavix",
            drug_class="antiplatelet",
            gene="CYP2C19",
            phenotype="poor metabolizer",
            risk_level="potential_concern",
            patient_summary="Your CYP2C19 result may affect how your body responds to clopidogrel.",
            clinician_summary="CYP2C19 poor metabolizer status may reduce clopidogrel activation.",
            recommended_action="Review this result with a clinician before making medication changes.",
            evidence_source="CPIC",
            evidence_url=evidence_url,
            rule_version="mvp-v1",
            review_status=status,
        ),
        RuleRecord(
            medication_generic_name="clopidogrel",
            brand_name="Plavix",
            drug_class="antiplatelet",
            gene="CYP2C19",
            phenotype="intermediate metabolizer",
            risk_level="caution",
            patient_summary="Your CYP2C19 result may affect how your body responds to clopidogrel.",
            clinician_summary=(
                "CYP2C19 intermediate metabolizer status may reduce clopidogrel "
                "activation compared with normal metabolizer status."
            ),
            recommended_action="Review this result with a clinician to discuss whether medication review is needed.",
            evidence_source="CPIC",
            evidence_url=evidence_url,
            rule_version="mvp-v1",
            review_status=status,
        ),
        RuleRecord(
            medication_generic_name="citalopram",
            brand_name="Celexa",
            drug_class="antidepressant",
            gene="CYP2C19",
            phenotype="poor metabolizer",
            risk_level="potential_concern",
            patient_summary="Your CYP2C19 result may affect how your body processes citalopram.",
            clinician_summary="CYP2C19 poor metabolizer status may increase citalopram exposure.",
            recommended_action=(
                "Review this result with a clinician to discuss medication selection, "
                "dosing, or monitoring."
            ),
            evidence_source="CPIC",
            evidence_url=evidence_url,
            rule_version="mvp-v1",
            review_status=status,
        ),
        RuleRecord(
            medication_generic_name="citalopram",
            brand_name="Celexa",
            drug_class="antidepressant",
            gene="CYP2C19",
            phenotype="intermediate metabolizer",
            risk_level="caution",
            patient_summary="Your CYP2C19 result may affect how your body processes citalopram.",
            clinician_summary="CYP2C19 intermediate metabolizer status may alter citalopram exposure.",
            recommended_action=(
                "Review this result with a clinician if you are currently taking "
                "or considering this medication."
            ),
            evidence_source="CPIC",
            evidence_url=evidence_url,
            rule_version="mvp-v1",
            review_status=status,
        ),
        RuleRecord(
            medication_generic_name="simvastatin",
            brand_name="Zocor",
            drug_class="statin",
            gene="SLCO1B1",
            phenotype="decreased function",
            risk_level="caution",
            patient_summary=(
                "Your SLCO1B1 result may affect your risk of muscle-related "
                "side effects with simvastatin."
            ),
            clinician_summary="SLCO1B1 decreased function may increase simvastatin exposure and myopathy risk.",
            recommended_action="Review this result with a clinician to discuss risk, monitoring, or alternatives.",
            evidence_source="CPIC",
            evidence_url=evidence_url,
            rule_version="mvp-v1",
            review_status=status,
        ),
    ]


def robots_allows(url: str) -> bool:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid URL: {url}")

    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)

    try:
        parser.read()
    except Exception as exc:
        logging.warning("Could not read robots.txt for %s: %s", parsed.netloc, exc)
        return False

    return parser.can_fetch(USER_AGENT, url)


def fetch_source(url: str, check_robots: bool = True) -> requests.Response:
    if check_robots and not robots_allows(url):
        raise RuntimeError(f"robots.txt does not allow fetching {url} with this user agent")

    logging.info("Fetching %s", url)
    response = requests.get(url, headers=HEADERS, timeout=45)
    time.sleep(RATE_LIMIT_SECONDS)
    response.raise_for_status()
    return response


def row_value(row: dict[str, str], *names: str) -> str:
    normalized = {normalize_key(k): v for k, v in row.items()}
    for name in names:
        value = normalized.get(normalize_key(name))
        if value:
            return value
    return ""


def parse_delimited_rules(
    text: str,
    delimiter: str,
    source_name: str,
    source_url: str,
) -> Iterable[RuleRecord]:
    reader = csv.DictReader(StringIO(text), delimiter=delimiter)
    for row in reader:
        raw_drug = row_value(row, "drug", "drug name", "chemical", "generic_name", "medication")
        raw_gene = row_value(row, "gene", "gene symbol", "gene_symbol")
        raw_phenotype = row_value(row, "phenotype", "metabolizer status", "function")

        med = normalize_medication(raw_drug)
        phenotype = normalize_phenotype(raw_phenotype)
        if not med or not raw_gene or not phenotype:
            continue

        yield RuleRecord(
            medication_generic_name=med.generic_name,
            brand_name=med.brand_name,
            drug_class=med.drug_class,
            gene=normalize_gene(raw_gene),
            phenotype=phenotype,
            risk_level="insufficient_data",
            patient_summary="Pending clinical review.",
            clinician_summary="Imported source candidate pending clinical review.",
            recommended_action="Pending clinical review before use.",
            evidence_source=source_name,
            evidence_url=source_url,
            rule_version="source-import-v0",
            review_status=REVIEW_PENDING,
        )


def xlsx_column_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return index - 1


def read_first_xlsx_sheet(content: bytes) -> list[list[str]]:
    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(BytesIO(content)) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("main:si", ns):
                parts = [node.text or "" for node in item.findall(".//main:t", ns)]
                shared_strings.append("".join(parts))

        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in archive.namelist():
            sheet_name = next(
                name for name in archive.namelist() if name.startswith("xl/worksheets/sheet")
            )

        root = ElementTree.fromstring(archive.read(sheet_name))
        rows: list[list[str]] = []
        for row in root.findall(".//main:sheetData/main:row", ns):
            values: list[str] = []
            for cell in row.findall("main:c", ns):
                ref = cell.attrib.get("r", "")
                idx = xlsx_column_index(ref)
                while len(values) <= idx:
                    values.append("")

                value_node = cell.find("main:v", ns)
                inline_node = cell.find("main:is/main:t", ns)
                value = ""
                if inline_node is not None and inline_node.text:
                    value = inline_node.text
                elif value_node is not None and value_node.text:
                    value = value_node.text
                    if cell.attrib.get("t") == "s":
                        value = shared_strings[int(value)]

                values[idx] = normalize_text(value)
            rows.append(values)

    return rows


def parse_cpic_gene_drug_pairs_xlsx(content: bytes, source_url: str) -> Iterable[RuleRecord]:
    rows = read_first_xlsx_sheet(content)
    if not rows:
        return []

    header = [normalize_key(cell) for cell in rows[0]]

    def get_cell(row: list[str], *names: str) -> str:
        for name in names:
            key = normalize_key(name)
            if key in header:
                idx = header.index(key)
                if idx < len(row):
                    return row[idx]
        return ""

    staged: list[RuleRecord] = []
    for row in rows[1:]:
        raw_drug = get_cell(row, "Drug", "Drug(s)", "drug")
        raw_genes = get_cell(row, "Genes", "Gene", "gene")

        med = normalize_medication(raw_drug)
        if not med or not raw_genes:
            continue

        for gene in raw_genes.replace(";", ",").split(","):
            clean_gene = normalize_gene(gene)
            if clean_gene not in {"CYP2C19", "SLCO1B1"}:
                continue

            # CPIC pair files identify relevant drug-gene pairs, not final phenotype actions.
            staged.append(
                RuleRecord(
                    medication_generic_name=med.generic_name,
                    brand_name=med.brand_name,
                    drug_class=med.drug_class,
                    gene=clean_gene,
                    phenotype="normal metabolizer" if clean_gene.startswith("CYP") else "normal function",
                    risk_level="insufficient_data",
                    patient_summary="Pending clinical review.",
                    clinician_summary="CPIC drug-gene pair candidate imported for manual review.",
                    recommended_action="Pending clinical review before use.",
                    evidence_source="CPIC",
                    evidence_url=source_url,
                    rule_version="cpic-pair-import-v0",
                    review_status=REVIEW_PENDING,
                )
            )

    return staged


def parse_html_table_rules(html: str, source_name: str, source_url: str) -> Iterable[RuleRecord]:
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.select("table"):
        headers = [normalize_key(th.get_text(" ")) for th in table.select("tr th")]
        if not headers:
            continue

        for tr in table.select("tr"):
            cells = [normalize_text(td.get_text(" ")) for td in tr.find_all("td")]
            if len(cells) < len(headers):
                continue

            row = dict(zip(headers, cells))
            yield from parse_delimited_rules(
                dict_to_csv_text(row),
                ",",
                source_name,
                source_url,
            )


def dict_to_csv_text(row: dict[str, str]) -> str:
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=list(row.keys()))
    writer.writeheader()
    writer.writerow(row)
    return output.getvalue()


def ingest_source_url(
    source_name: str,
    source_url: str,
    check_robots: bool = True,
) -> list[RuleRecord]:
    response = fetch_source(source_url, check_robots=check_robots)
    content_type = response.headers.get("content-type", "").lower()
    url_lower = source_url.lower()

    if url_lower.endswith(".xlsx") or "spreadsheetml" in content_type:
        if "cpic_gene-drug_pairs" in url_lower:
            return list(parse_cpic_gene_drug_pairs_xlsx(response.content, source_url))
        raise RuntimeError(f"No XLSX parser is configured for {source_url}")

    if url_lower.endswith(".csv") or "text/csv" in content_type:
        return list(parse_delimited_rules(response.text, ",", source_name, source_url))

    if url_lower.endswith(".tsv") or "tab-separated-values" in content_type:
        return list(parse_delimited_rules(response.text, "\t", source_name, source_url))

    if "text/html" in content_type or url_lower.endswith((".html", "/")):
        return list(parse_html_table_rules(response.text, source_name, source_url))

    raise RuntimeError(f"Unsupported source content type for {source_url}: {content_type}")


def upsert_medication(conn: psycopg.Connection, rule: RuleRecord) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO medications (generic_name, brand_name, drug_class, is_active)
            VALUES (%s, %s, %s, true)
            ON CONFLICT (generic_name) DO UPDATE
            SET brand_name = COALESCE(EXCLUDED.brand_name, medications.brand_name),
                drug_class = COALESCE(EXCLUDED.drug_class, medications.drug_class),
                is_active = true
            RETURNING id;
            """,
            (rule.medication_generic_name, rule.brand_name, rule.drug_class),
        )
        return cur.fetchone()[0]


def upsert_rule(conn: psycopg.Connection, rule: RuleRecord) -> None:
    validate_rule(rule)
    medication_id = upsert_medication(conn, rule)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO drug_gene_rules (
              medication_id,
              gene,
              phenotype,
              risk_level,
              patient_summary,
              clinician_summary,
              recommended_action,
              evidence_source,
              evidence_url,
              rule_version,
              review_status,
              imported_at,
              updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
            ON CONFLICT (medication_id, gene, phenotype) DO UPDATE
            SET risk_level = EXCLUDED.risk_level,
                patient_summary = EXCLUDED.patient_summary,
                clinician_summary = EXCLUDED.clinician_summary,
                recommended_action = EXCLUDED.recommended_action,
                evidence_source = EXCLUDED.evidence_source,
                evidence_url = EXCLUDED.evidence_url,
                rule_version = EXCLUDED.rule_version,
                review_status = EXCLUDED.review_status,
                imported_at = COALESCE(drug_gene_rules.imported_at, now()),
                updated_at = now();
            """,
            (
                medication_id,
                normalize_gene(rule.gene),
                normalize_key(rule.phenotype),
                rule.risk_level,
                rule.patient_summary,
                rule.clinician_summary,
                rule.recommended_action,
                rule.evidence_source,
                rule.evidence_url,
                rule.rule_version,
                rule.review_status,
            ),
        )


def write_review_csv(path: str, rules: Iterable[RuleRecord]) -> None:
    fieldnames = list(RuleRecord.__dataclass_fields__.keys())
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for rule in rules:
            writer.writerow(rule.__dict__)


def insert_rules(rules: list[RuleRecord]) -> None:
    database_url = require_database_url()
    with psycopg.connect(database_url) as conn:
        with conn.transaction():
            for rule in rules:
                upsert_rule(conn, rule)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Medune MVP PGx medication/rule data.")
    parser.add_argument("--seed-mvp", action="store_true", help="Insert the five MVP starter rules.")
    parser.add_argument(
        "--mark-approved",
        action="store_true",
        help="Mark starter rules approved. Use only after qualified clinical review.",
    )
    parser.add_argument(
        "--cpic-pairs",
        action="store_true",
        help="Download CPIC gene-drug pair candidates and stage supported MVP pairs for review.",
    )
    parser.add_argument(
        "--source-url",
        action="append",
        default=[],
        help="Additional approved CSV/TSV/HTML/XLSX source URL to stage as pending_review.",
    )
    parser.add_argument(
        "--source-name",
        default="custom_public_source",
        help="Evidence source label for --source-url records.",
    )
    parser.add_argument(
        "--skip-robots-check",
        action="store_true",
        help="Only use for official downloadable files after confirming source terms manually.",
    )
    parser.add_argument(
        "--review-csv",
        help="Write staged records to a CSV for review instead of inserting into PostgreSQL.",
    )

    args = parser.parse_args()
    rules: list[RuleRecord] = []

    if args.seed_mvp:
        rules.extend(get_manual_mvp_rules(mark_approved=args.mark_approved))

    if args.cpic_pairs:
        rules.extend(
            ingest_source_url(
                "CPIC",
                CPIC_GENE_DRUG_PAIRS_URL,
                check_robots=not args.skip_robots_check,
            )
        )

    for url in args.source_url:
        rules.extend(
            ingest_source_url(
                args.source_name,
                url,
                check_robots=not args.skip_robots_check,
            )
        )

    deduped = {
        (
            rule.medication_generic_name,
            normalize_gene(rule.gene),
            normalize_key(rule.phenotype),
            rule.evidence_source,
        ): rule
        for rule in rules
    }
    rules = list(deduped.values())

    if not rules:
        logging.warning("No records prepared. Use --seed-mvp, --cpic-pairs, or --source-url.")
        return

    logging.info("Prepared %d records.", len(rules))

    if args.review_csv:
        write_review_csv(args.review_csv, rules)
        logging.info("Wrote review CSV to %s", args.review_csv)
        return

    insert_rules(rules)
    logging.info("Inserted or updated %d records.", len(rules))


if __name__ == "__main__":
    main()
