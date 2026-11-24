"""Input validation for product tables and resource settings.

All user input (file uploads, the in-app table editor, number inputs) passes
through these functions before it reaches the solver or the database. The
functions never raise on bad data; they return a report with readable error
messages so the UI can show exactly what to fix.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Mapping

import numpy as np
import pandas as pd

from optimizer.model import (
    NUMERIC_PRODUCT_COLUMNS,
    PRODUCT_COLUMNS,
    PRODUCT_FIELD_LABELS,
    RESOURCE_FIELDS,
    RESOURCE_LABELS,
    ProductionProblem,
    Resources,
)

MAX_PRODUCTS = 100
MAX_ABS_VALUE = 1e9
MAX_MATERIAL_MULTIPLIER = 10.0
MAX_REPORTED_ERRORS = 25

REQUIRED_COLUMNS: tuple[str, ...] = PRODUCT_COLUMNS[:7]
OPTIONAL_COLUMNS: tuple[str, ...] = ("min_units", "max_units")

# IDs and names are shown in tables, charts, Markdown text and exported
# spreadsheets. Restricting them to a plain character set (and requiring a
# letter or digit first) blocks spreadsheet formula injection ("=HYPERLINK(...)")
# and Markdown/HTML tricks in rendered recommendation text.
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$")
NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.,&()/'#+-]{0,59}$")


class InputValidationError(ValueError):
    """Raised by build_problem when inputs fail validation."""

    def __init__(self, errors: list[str]):
        self.errors = list(errors)
        super().__init__("; ".join(self.errors))


@dataclass
class ValidationReport:
    products: pd.DataFrame | None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors and self.products is not None


def normalize_column_name(name: object) -> str:
    text = str(name).strip().lower()
    text = re.sub(r"[\s\-]+", "_", text)
    return text


def _is_blank(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if value is pd.NA or value is pd.NaT:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _to_float(value: object) -> float | None:
    """Convert one cell to float; None if it is not a plain number."""
    if isinstance(value, bool):  # True/False should not silently become 1/0
        return None
    if isinstance(value, (int, float, np.integer, np.floating)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _cap_errors(errors: list[str]) -> list[str]:
    if len(errors) <= MAX_REPORTED_ERRORS:
        return errors
    hidden = len(errors) - MAX_REPORTED_ERRORS
    return errors[:MAX_REPORTED_ERRORS] + [f"...and {hidden} more problem(s)."]


def validate_products(
    frame: pd.DataFrame | None,
    *,
    row_offset: int = 2,
    max_rows: int = MAX_PRODUCTS,
) -> ValidationReport:
    """Validate a product table and return a clean, typed copy.

    row_offset converts a 0-based row position into the row number the user
    sees. For a CSV/Excel file with a header line, data row 0 is spreadsheet
    row 2, so the default is 2. The in-app editor uses 1.
    """
    if frame is None or len(frame.columns) == 0:
        return ValidationReport(None, ["The product table is empty."])

    df = frame.copy()
    df.columns = [normalize_column_name(c) for c in df.columns]

    duplicated = sorted({c for c in df.columns if list(df.columns).count(c) > 1})
    if duplicated:
        return ValidationReport(None, [f"Duplicate column name(s): {', '.join(duplicated)}."])

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        return ValidationReport(
            None,
            [
                "Missing required column(s): "
                + ", ".join(missing)
                + ". Required columns are: "
                + ", ".join(REQUIRED_COLUMNS)
                + " (optional: min_units, max_units)."
            ],
        )

    warnings: list[str] = []
    extra = [c for c in df.columns if c not in PRODUCT_COLUMNS]
    if extra:
        warnings.append(f"Ignored extra column(s): {', '.join(extra)}.")

    for column in OPTIONAL_COLUMNS:
        if column not in df.columns:
            df[column] = np.nan

    df = df[list(PRODUCT_COLUMNS)]

    if df.empty:
        return ValidationReport(None, ["The product table has no data rows."], warnings)

    # Drop rows that are completely empty (trailing CSV lines, blank editor rows).
    blank_mask = pd.Series(
        [all(_is_blank(v) for v in row) for row in df.itertuples(index=False)],
        index=df.index,
        dtype=bool,
    )
    if blank_mask.any():
        warnings.append(f"Skipped {int(blank_mask.sum())} empty row(s).")
        df = df.loc[~blank_mask]

    if df.empty:
        return ValidationReport(None, ["The product table has no data rows."], warnings)
    if len(df) > max_rows:
        return ValidationReport(
            None,
            [f"Too many products: {len(df)} rows (the limit is {max_rows})."],
            warnings,
        )

    errors: list[str] = []
    clean_rows: list[dict] = []
    seen_ids: dict[str, int] = {}

    for position, (_, row) in enumerate(df.iterrows()):
        row_no = position + row_offset
        label = f"Row {row_no}"
        clean: dict[str, object] = {}

        raw_id = row["product_id"]
        product_id = "" if _is_blank(raw_id) else str(raw_id).strip()
        if not product_id:
            errors.append(f"{label}: product_id is empty.")
        elif not ID_PATTERN.match(product_id):
            errors.append(
                f"{label}: product_id '{product_id[:30]}' must start with a letter or digit and "
                "use only letters, digits, '-' or '_' (max 20 characters)."
            )
        elif product_id in seen_ids:
            errors.append(
                f"{label}: product_id '{product_id}' is a duplicate of row {seen_ids[product_id]}."
            )
        else:
            seen_ids[product_id] = row_no
        clean["product_id"] = product_id

        raw_name = row["product_name"]
        product_name = "" if _is_blank(raw_name) else str(raw_name).strip()
        if not product_name:
            errors.append(f"{label}: product_name is empty.")
        elif not NAME_PATTERN.match(product_name):
            errors.append(
                f"{label}: product_name '{product_name[:30]}' must start with a letter or digit, "
                "be at most 60 characters, and use only letters, digits, spaces and . , & ( ) / ' # + - _"
            )
        clean["product_name"] = product_name

        for column in NUMERIC_PRODUCT_COLUMNS:
            raw = row[column]
            nice = PRODUCT_FIELD_LABELS[column]
            if _is_blank(raw):
                if column == "min_units":
                    clean[column] = 0.0
                elif column == "max_units":
                    clean[column] = np.nan  # no demand cap
                else:
                    errors.append(f"{label}: '{column}' ({nice}) is empty.")
                    clean[column] = np.nan
                continue
            value = _to_float(raw)
            if value is None:
                errors.append(
                    f"{label}: '{column}' value '{str(raw)[:20]}' is not a number "
                    "(use plain numbers without $ signs or thousands separators)."
                )
                clean[column] = np.nan
                continue
            if not math.isfinite(value):
                errors.append(f"{label}: '{column}' must be a finite number.")
            elif value < 0:
                errors.append(f"{label}: '{column}' cannot be negative (got {value:g}).")
            elif value > MAX_ABS_VALUE:
                errors.append(f"{label}: '{column}' is unrealistically large (got {value:g}).")
            clean[column] = value

        min_units = clean.get("min_units")
        max_units = clean.get("max_units")
        if (
            isinstance(min_units, float)
            and isinstance(max_units, float)
            and math.isfinite(min_units)
            and math.isfinite(max_units)
            and max_units < min_units
        ):
            errors.append(
                f"{label}: max_units ({max_units:g}) is less than min_units ({min_units:g})."
            )
        clean_rows.append(clean)

    if errors:
        return ValidationReport(None, _cap_errors(errors), warnings)

    products = pd.DataFrame(clean_rows, columns=list(PRODUCT_COLUMNS))
    products["product_id"] = products["product_id"].astype(str)
    products["product_name"] = products["product_name"].astype(str)
    for column in NUMERIC_PRODUCT_COLUMNS:
        products[column] = products[column].astype(float)
    products = products.reset_index(drop=True)
    return ValidationReport(products, [], warnings)


def validate_resources(values: Mapping[str, object] | None) -> tuple[Resources | None, list[str]]:
    """Validate the six shared-resource settings."""
    if values is None:
        return None, ["Resource settings are missing."]
    errors: list[str] = []
    parsed: dict[str, float] = {}
    for name in RESOURCE_FIELDS:
        nice = RESOURCE_LABELS[name]
        raw = values.get(name)
        if _is_blank(raw):
            if name == "material_cost_multiplier":
                parsed[name] = 1.0
                continue
            errors.append(f"{nice} is missing.")
            continue
        value = _to_float(raw)
        if value is None:
            errors.append(f"{nice} must be a number (got '{str(raw)[:20]}').")
            continue
        if not math.isfinite(value):
            errors.append(f"{nice} must be a finite number.")
            continue
        if value < 0:
            errors.append(f"{nice} cannot be negative (got {value:g}).")
            continue
        if value > MAX_ABS_VALUE:
            errors.append(f"{nice} is unrealistically large (got {value:g}).")
            continue
        if name == "material_cost_multiplier" and not (0 < value <= MAX_MATERIAL_MULTIPLIER):
            errors.append(
                f"{nice} must be greater than 0 and at most {MAX_MATERIAL_MULTIPLIER:g} (got {value:g})."
            )
            continue
        parsed[name] = value
    if errors:
        return None, errors
    return Resources(**parsed), []


def build_problem(
    products: pd.DataFrame, resources: Mapping[str, object] | Resources, *, row_offset: int = 2
) -> ProductionProblem:
    """Validate both inputs and return a ProductionProblem, or raise InputValidationError."""
    report = validate_products(products, row_offset=row_offset)
    if isinstance(resources, Resources):
        resource_obj, resource_errors = validate_resources(resources.as_dict())
    else:
        resource_obj, resource_errors = validate_resources(resources)
    errors = report.errors + resource_errors
    if errors or report.products is None or resource_obj is None:
        raise InputValidationError(errors or ["Invalid input."])
    return ProductionProblem.from_frame(report.products, resource_obj)


def economic_warnings(problem: ProductionProblem) -> list[str]:
    """Non-fatal warnings about the economics of a valid problem."""
    warnings: list[str] = []
    margins = problem.unit_margins()
    material = problem.unit_material_costs()
    for product, margin, mat in zip(problem.products, margins, material):
        if margin <= 0:
            warnings.append(
                f"{product.product_name} has a unit margin of ${margin:,.2f} at current costs, "
                "so the optimizer will only make its minimum commitment."
            )
        uses_nothing = product.labor_hours == 0 and product.machine_hours == 0 and mat == 0
        if uses_nothing and product.max_units is None and margin > 0:
            warnings.append(
                f"{product.product_name} uses no labor, machine time or material and has no demand cap, "
                "so the model has no limit on how many to make (the LP will be unbounded)."
            )
    return warnings
