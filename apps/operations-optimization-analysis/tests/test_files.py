"""Upload parsing (CSV/Excel) and export round-trips."""

from __future__ import annotations

import io
import zipfile

import openpyxl
import pandas as pd
import pytest

from data.files import (
    MAX_UPLOAD_BYTES,
    dataset_to_excel_bytes,
    frame_to_csv_bytes,
    parse_upload,
    sanitize_cell,
    solution_to_excel_bytes,
)
from data.sample_data import SAMPLE_DIR, sample_products_frame, sample_resources
from optimizer.recommendations import recommendations
from optimizer.solver import solve


def test_sample_csv_upload_is_accepted():
    parsed = parse_upload("products.csv", (SAMPLE_DIR / "products.csv").read_bytes())
    assert parsed.ok, parsed.errors
    pd.testing.assert_frame_equal(parsed.products, sample_products_frame())
    assert parsed.resources is None


def test_invalid_example_file_reports_each_problem():
    parsed = parse_upload("bad.csv", (SAMPLE_DIR / "invalid_products_example.csv").read_bytes())
    assert not parsed.ok
    text = " ".join(parsed.errors)
    assert "'abc' is not a number" in text
    assert "cannot be negative" in text
    assert "duplicate" in text
    assert "less than min_units" in text


def test_sample_workbook_upload_reads_products_and_resources():
    parsed = parse_upload("sample_dataset.xlsx", (SAMPLE_DIR / "sample_dataset.xlsx").read_bytes())
    assert parsed.ok, parsed.errors
    assert parsed.resources == sample_resources()
    pd.testing.assert_frame_equal(parsed.products, sample_products_frame())
    assert any("Ignored sheet" in w for w in parsed.warnings)


@pytest.mark.parametrize("filename,content,fragment", [
    ("products.txt", b"a,b\n1,2\n", "Unsupported file type"),
    ("products.csv", b"", "empty"),
    ("products.csv", b"\xff\xfe\x00bad", "not UTF-8"),
    ("products.xlsx", b"not a zip file", "not a valid .xlsx"),
    ("products.csv", b"product_id,product_name\nA,B\n", "Missing required column"),
])
def test_bad_uploads_are_rejected_with_a_reason(filename, content, fragment):
    parsed = parse_upload(filename, content)
    assert not parsed.ok
    assert any(fragment in e for e in parsed.errors), parsed.errors


def test_oversized_upload_is_rejected_before_parsing():
    parsed = parse_upload("big.csv", b"x" * (MAX_UPLOAD_BYTES + 1))
    assert not parsed.ok and "limit is 2 MB" in parsed.errors[0]


def test_workbook_that_expands_too_much_is_rejected():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", b"0" * (21 * 1024 * 1024))
    content = buffer.getvalue()
    assert len(content) < MAX_UPLOAD_BYTES  # small on disk, large when expanded
    parsed = parse_upload("bomb.xlsx", content)
    assert not parsed.ok and "more than 20 MB" in parsed.errors[0]


def test_bad_resources_sheet_is_reported():
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        sample_products_frame().to_excel(writer, sheet_name="products", index=False)
        pd.DataFrame({"parameter": ["labor_hours_available", "wizard_power"], "value": [-1, 3]}).to_excel(
            writer, sheet_name="resources", index=False)
    parsed = parse_upload("x.xlsx", buffer.getvalue())
    assert not parsed.ok
    text = " ".join(parsed.errors)
    assert "wizard_power" in text and "cannot be negative" in text


def test_dataset_excel_round_trip():
    content = dataset_to_excel_bytes(sample_products_frame(), sample_resources())
    parsed = parse_upload("roundtrip.xlsx", content)
    assert parsed.ok, parsed.errors
    pd.testing.assert_frame_equal(parsed.products, sample_products_frame())
    assert parsed.resources == sample_resources()


def test_csv_export_round_trip(sample_problem):
    sol = solve(sample_problem)
    back = pd.read_csv(io.BytesIO(frame_to_csv_bytes(sol.plan)))
    assert list(back.columns) == list(sol.plan.columns)
    assert back["units"].to_numpy() == pytest.approx(sol.plan["units"].to_numpy())
    assert back["contribution"].sum() == pytest.approx(sol.objective)


def test_results_workbook_contains_the_solution(sample_problem):
    sol = solve(sample_problem)
    recs = recommendations(sample_problem, sol)
    content = solution_to_excel_bytes(sample_problem, sol, recs, title="Test", synthetic_notice="Synthetic")
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, engine="openpyxl")
    assert {"Summary", "Plan", "Constraints", "Inputs_Products", "Inputs_Resources", "Recommendations"} <= set(sheets)
    summary = dict(zip(sheets["Summary"]["field"], sheets["Summary"]["value"]))
    assert float(summary["Total profit contribution"]) == pytest.approx(sol.objective)
    assert summary["Data notice"] == "Synthetic"
    assert sheets["Plan"]["units"].to_numpy() == pytest.approx(sol.plan["units"].to_numpy())
    assert len(sheets["Recommendations"]) == len(recs)


def test_formula_like_text_is_neutralized_in_exports():
    assert sanitize_cell("=1+1") == "'=1+1"
    assert sanitize_cell("@SUM(A1)") == "'@SUM(A1)"
    assert sanitize_cell("Dining Table") == "Dining Table"
    assert sanitize_cell(-5.0) == -5.0
    frame = pd.DataFrame({"name": ["=HYPERLINK(\"http://example.invalid\")"], "value": [float("inf")]})
    csv_text = frame_to_csv_bytes(frame).decode()
    assert "'=HYPERLINK" in csv_text and "inf" not in csv_text

    content = solution_to_excel_bytes(*_tiny_solution(), title="=cmd|' /C calc'!A0")
    workbook = openpyxl.load_workbook(io.BytesIO(content))
    cell = workbook["Summary"]["B3"]
    assert cell.data_type == "s" and cell.value.startswith("'=")


def _tiny_solution():
    from tests.conftest import wyndor

    problem = wyndor()
    return problem, solve(problem)
