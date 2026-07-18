import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import ingest_medune_mvp_data as ingest


class IngestPipelineTests(unittest.TestCase):
    def test_collect_mvp_writes_expanded_raw_records(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "raw.json"

            ingest.collect_mvp_sources(str(output))

            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["collectorVersion"], ingest.COLLECTOR_VERSION)
            self.assertEqual(len(payload["records"]), len(ingest.MVP_RULE_SPECS))
            self.assertEqual(len(payload["records"]), 14)
            medications = {
                record["medication"]["genericName"]
                for record in payload["records"]
            }
            self.assertEqual(medications, {"clopidogrel", "citalopram", "simvastatin"})
            phenotypes = {record["phenotype"] for record in payload["records"]}
            self.assertIn("ultrarapid metabolizer", phenotypes)
            self.assertIn("poor function", phenotypes)
            self.assertIn("possible decreased function", phenotypes)

    def test_normalize_creates_expected_fields(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            raw = Path(temp_dir) / "raw.json"
            normalized = Path(temp_dir) / "normalized.json"
            ingest.collect_mvp_sources(str(raw))

            ingest.normalize_collected_sources(str(raw), str(normalized))

            payload = json.loads(normalized.read_text(encoding="utf-8"))
            first = payload["records"][0]
            self.assertEqual(first["genericName"], "clopidogrel")
            self.assertEqual(first["brandName"], "Plavix")
            self.assertEqual(first["gene"], "CYP2C19")
            self.assertEqual(first["phenotype"], "poor metabolizer")
            self.assertEqual(first["reviewStatus"], ingest.REVIEW_PENDING)

    def test_dry_run_works_without_database_url(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            raw = Path(temp_dir) / "raw.json"
            normalized = Path(temp_dir) / "normalized.json"
            ingest.collect_mvp_sources(str(raw))
            ingest.normalize_collected_sources(str(raw), str(normalized))

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                ingest.dry_run_normalized(str(normalized))

            summary = output.getvalue()
            self.assertIn("Medications: 3", summary)
            self.assertIn("Rule candidates: 14", summary)
            self.assertIn("Pending-review records: 14", summary)

    def test_invalid_raw_input_fails_clearly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            raw = Path(temp_dir) / "raw.json"
            raw.write_text("{}", encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "records array"):
                ingest.normalize_collected_sources(str(raw), str(Path(temp_dir) / "out.json"))

    def test_ingest_normalized_requires_database_url(self):
        original_database_url = ingest.DATABASE_URL
        ingest.DATABASE_URL = ""
        try:
            with self.assertRaisesRegex(RuntimeError, "DATABASE_URL is required"):
                ingest.ingest_normalized_records("unused.json")
        finally:
            ingest.DATABASE_URL = original_database_url


if __name__ == "__main__":
    unittest.main()
