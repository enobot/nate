"""CSV/Excel upload parsing and result export.

Uploads are treated as untrusted input:
* size is capped before parsing (MAX_UPLOAD_BYTES);
* only .csv and .xlsx are accepted, and an .xlsx must be a real zip archive
  whose uncompressed size is capped (a guard against "zip bomb" files);
* every cell then goes through optimizer.validation.

Exports protect against spreadsheet formula injection: any text cell that
starts with = + - @ (or a tab/carriage return) is prefixed with an apostrophe
so Excel shows it as text instead of running it as a formula.
"""

from __future__ import annotations

import io
import math
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Sequence

import pandas as pd

from optimizer.model import RESOURCE_FIELDS, RESOURCE_LABELS, ProductionProblem, Resources
from optimizer.recommendations import Recommendation
from optimizer.solver import Solution
from optimizer.validation import normalize_column_name, validate_products, validate_resources

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB is far more than 100 products need
MAX_XLSX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = (".csv", ".xlsx")
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


@dataclass
class ParsedUpload:
    products: pd.DataFrame | None
    resources: Resources | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors and self.products is not None


def _extension(filename: str) -> str:
    return PurePath(filename or "").suffix.lower()


def _read_csv(content: bytes) -> tuple[pd.DataFrame | None, list[str]]:
    try:
        # dtype=str keeps raw text so validation can report exactly what was typed.
        frame = pd.read_csv(io.BytesIO(content), dtype=str, encoding="utf-8-sig")
    except UnicodeDecodeError:
        return None, ["The CSV file is not UTF-8 text. Re-save it as 'CSV UTF-8' and try again."]
    except pd.errors.EmptyDataError:
        return None, ["The CSV file is empty."]
    except pd.errors.ParserError as exc:
        return None, [f"The CSV file could not be parsed: {str(exc)[:200]}"]
    return frame, []


def _check_xlsx_archive(content: bytes) -> list[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            total = sum(info.file_size for info in archive.infolist())
    except zipfile.BadZipFile:
        return ["The file is not a valid .xlsx workbook."]
    if total > MAX_XLSX_UNCOMPRESSED_BYTES:
        return ["The workbook expands to more than 20 MB when opened, which is too large."]
    return []


def resources_from_frame(frame: pd.DataFrame) -> tuple[Resources | None, list[str]]:
    """Parse a two-column (parameter, value) resources table."""
    df = frame.copy()
    df.columns = [normalize_column_name(c) for c in df.columns]
    if not {"parameter", "value"}.issubset(df.columns):
        return None, ["The resources sheet needs two columns: parameter and value."]
    values: dict[str, object] = {}
    unknown = []
    for raw_name, raw_value in zip(df["parameter"], df["value"]):
        if raw_name is None or (isinstance(raw_name, float) and math.isnan(raw_name)):
            continue
        name = normalize_column_name(raw_name)
        if name in RESOURCE_FIELDS:
            values[name] = raw_value
        else:
            unknown.append(str(raw_name)[:40])
    resources, errors = validate_resources(values)
    if unknown:
        errors = errors + [
            "Unknown resource parameter(s): " + ", ".join(unknown)
            + ". Expected: " + ", ".join(RESOURCE_FIELDS) + "."
        ]
        resources = None if errors else resources
    return resources, errors


def parse_upload(filename: str, content: bytes) -> ParsedUpload:
    """Parse and validate an uploaded product file (CSV, or Excel with optional resources sheet)."""
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return ParsedUpload(None, errors=[f"Unsupported file type '{ext or 'none'}'. Upload a .csv or .xlsx file."])
    if not content:
        return ParsedUpload(None, errors=["The file is empty."])
    if len(content) > MAX_UPLOAD_BYTES:
        return ParsedUpload(
            None, errors=[f"The file is {len(content) / 1_048_576:.1f} MB; the limit is 2 MB."]
        )

    warnings: list[str] = []
    resources: Resources | None = None

    if ext == ".csv":
        frame, errors = _read_csv(content)
        if errors:
            return ParsedUpload(None, errors=errors)
    else:
        errors = _check_xlsx_archive(content)
        if errors:
            return ParsedUpload(None, errors=errors)
        try:
            sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, engine="openpyxl", dtype=object)
        except Exception as exc:  # openpyxl raises several types for corrupt files
            return ParsedUpload(None, errors=[f"The workbook could not be read: {type(exc).__name__}."])
        if not sheets:
            return ParsedUpload(None, errors=["The workbook has no sheets."])
        by_name = {normalize_column_name(name): name for name in sheets}
        products_sheet = by_name.get("products", next(iter(sheets)))
        if "products" not in by_name:
            warnings.append(f"No sheet named 'products'; read the first sheet ('{products_sheet}').")
        frame = sheets[products_sheet]
        if "resources" in by_name:
            resources, res_errors = resources_from_frame(sheets[by_name["resources"]])
            if res_errors:
                return ParsedUpload(None, errors=["Resources sheet: " + e for e in res_errors])
        ignored = [n for n in sheets if n not in (products_sheet, by_name.get("resources"))]
        if ignored:
            warnings.append("Ignored sheet(s): " + ", ".join(str(n) for n in ignored) + ".")

    report = validate_products(frame)
    return ParsedUpload(
        report.products if report.ok else None,
        resources=resources if report.ok else None,
        errors=report.errors,
        warnings=warnings + report.warnings,
    )


# -------------------------------------------------------------------- export
def sanitize_cell(value: object) -> object:
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def sanitize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Copy of `frame` that is safe to open in a spreadsheet (see module docstring).

    Infinite values (e.g. "no upper limit" in a range) become blank cells,
    because spreadsheets have no representation for infinity.
    """
    clean = frame.copy()
    for column in clean.columns:
        series = clean[column]
        if pd.api.types.is_bool_dtype(series):
            continue
        if pd.api.types.is_numeric_dtype(series):
            clean[column] = series.replace([float("inf"), float("-inf")], float("nan"))
        elif series.dtype == object or pd.api.types.is_string_dtype(series):
            clean[column] = series.map(sanitize_cell)
    clean.columns = [sanitize_cell(str(c)) for c in clean.columns]
    return clean


def frame_to_csv_bytes(frame: pd.DataFrame) -> bytes:
    return sanitize_frame(frame).to_csv(index=False, lineterminator="\n").encode("utf-8")


def resources_table(resources: Resources) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"parameter": name, "label": RESOURCE_LABELS[name], "value": float(getattr(resources, name))}
            for name in RESOURCE_FIELDS
        ]
    )


def dataset_to_excel_bytes(products: pd.DataFrame, resources: Resources) -> bytes:
    """Workbook in the same layout the uploader accepts (products + resources sheets)."""
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        sanitize_frame(products).to_excel(writer, sheet_name="products", index=False)
        sanitize_frame(resources_table(resources)[["parameter", "value"]]).to_excel(
            writer, sheet_name="resources", index=False
        )
    return buffer.getvalue()


def solution_to_excel_bytes(
    problem: ProductionProblem,
    solution: Solution,
    recommendations: Sequence[Recommendation] = (),
    *,
    title: str = "Working scenario",
    synthetic_notice: str | None = None,
    ranges: pd.DataFrame | None = None,
) -> bytes:
    """Full results workbook: summary, plan, constraints, inputs, recommendations."""
    summary_rows = [
        ("Report", "Operations & Optimization Analysis - optimization results"),
        ("Scenario", title),
        ("Exported (UTC)", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        ("Status", solution.status),
        ("Solver message", solution.solver_message),
        ("Total profit contribution", solution.objective if solution.is_optimal else None),
        ("Model", "Whole units (MILP)" if solution.integer else "Linear program (fractional units allowed)"),
        ("Solver", "scipy.optimize.linprog, method='highs'"),
    ]
    if synthetic_notice:
        summary_rows.insert(2, ("Data notice", synthetic_notice))
    for note in solution.diagnosis:
        summary_rows.append(("Diagnosis", note))
    summary = pd.DataFrame(summary_rows, columns=["field", "value"])

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        sanitize_frame(summary).to_excel(writer, sheet_name="Summary", index=False)
        sanitize_frame(solution.plan).to_excel(writer, sheet_name="Plan", index=False)
        sanitize_frame(solution.constraints).to_excel(writer, sheet_name="Constraints", index=False)
        if ranges is not None and not ranges.empty:
            sanitize_frame(ranges).to_excel(writer, sheet_name="Ranges", index=False)
        sanitize_frame(problem.products_frame(include_economics=True)).to_excel(
            writer, sheet_name="Inputs_Products", index=False
        )
        sanitize_frame(resources_table(problem.resources)).to_excel(
            writer, sheet_name="Inputs_Resources", index=False
        )
        recs = pd.DataFrame([{"type": r.kind, "recommendation": r.text} for r in recommendations],
                            columns=["type", "recommendation"])
        sanitize_frame(recs).to_excel(writer, sheet_name="Recommendations", index=False)
    return buffer.getvalue()
