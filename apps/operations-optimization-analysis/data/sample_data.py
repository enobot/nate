"""Synthetic sample data for a fictional manufacturer.

Juniper Oak Furniture Co. does not exist. The product economics below were
chosen by hand to look like a small furniture shop's monthly plan, and the
12-month production history is built from a fixed random seed so it can
be rebuilt exactly (scripts/build_sample_data.py writes the files in
sample_data/, and tests/test_sample_data.py checks they match this code).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from optimizer.model import PRODUCT_COLUMNS, Resources

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_DIR = PROJECT_ROOT / "sample_data"

COMPANY_NAME = "Juniper Oak Furniture Co."
SAMPLE_DATASET_NAME = "Juniper Oak sample (synthetic)"
SYNTHETIC_NOTICE = (
    "Synthetic data: Juniper Oak Furniture Co. is a fictional company. Every price, cost, "
    "capacity and history value in this dataset was made up for demonstration."
)

# product_id, product_name, unit_price, material_cost, other_variable_cost,
# labor_hours, machine_hours, min_units, max_units   (per month)
_PRODUCTS = [
    ("DT-100", "Dining Table", 690.0, 210.0, 35.0, 5.5, 1.6, 40.0, 260.0),
    ("CH-200", "Dining Chair", 165.0, 28.0, 8.0, 2.2, 0.4, 80.0, 900.0),
    ("BK-300", "Bookcase", 330.0, 120.0, 18.0, 1.6, 1.5, 0.0, 300.0),
    ("DS-400", "Office Desk", 540.0, 170.0, 28.0, 4.2, 1.4, 25.0, 220.0),
    ("CT-500", "Coffee Table", 280.0, 75.0, 14.0, 2.6, 0.8, 0.0, 350.0),
    ("NS-600", "Nightstand", 210.0, 58.0, 11.0, 2.0, 0.7, 0.0, 400.0),
]

SAMPLE_RESOURCES = Resources(
    labor_hours_available=2800.0,  # about 16-17 full-time builders
    machine_hours_available=1100.0,  # CNC router + finishing line
    material_budget=95000.0,  # monthly lumber/hardware purchasing budget
    labor_rate=24.0,
    machine_rate=18.0,
    material_cost_multiplier=1.0,
)

HISTORY_SEED = 20251101
HISTORY_MONTHS = [
    "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
    "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
]
# Rough seasonality for furniture orders (holiday and spring peaks).
_SEASONALITY = [1.08, 1.02, 0.88, 0.92, 1.00, 1.04, 1.06, 1.00, 0.95, 0.98, 1.03, 1.05]
# The mix the (fictional) shop actually ran, which is deliberately not the
# LP-optimal mix: it is what an order-driven shop might make.
_HISTORICAL_BASE_UNITS = {
    "DT-100": 180, "CH-200": 240, "BK-300": 90, "DS-400": 40, "CT-500": 210, "NS-600": 100,
}

HISTORY_COLUMNS = [
    "month",
    "product_id",
    "units_produced",
    "revenue",
    "material_spend",
    "labor_hours_used",
    "machine_hours_used",
]


def sample_products_frame() -> pd.DataFrame:
    frame = pd.DataFrame(_PRODUCTS, columns=list(PRODUCT_COLUMNS))
    for column in PRODUCT_COLUMNS[2:]:
        frame[column] = frame[column].astype(float)
    return frame


def sample_resources() -> Resources:
    return SAMPLE_RESOURCES


def resources_frame(resources: Resources) -> pd.DataFrame:
    return pd.DataFrame(
        [{"parameter": k, "value": float(v)} for k, v in resources.as_dict().items()]
    )


def build_production_history(seed: int = HISTORY_SEED) -> pd.DataFrame:
    """12 months of synthetic production records, reproducible from `seed`."""
    rng = np.random.default_rng(seed)
    products = sample_products_frame().set_index("product_id")
    rows = []
    for month, season in zip(HISTORY_MONTHS, _SEASONALITY):
        for product_id, base in _HISTORICAL_BASE_UNITS.items():
            p = products.loc[product_id]
            units = int(round(base * season * rng.normal(1.0, 0.06)))
            units = int(min(max(units, int(p["min_units"])), int(p["max_units"])))
            revenue = units * p["unit_price"] * rng.normal(0.97, 0.01)  # discounts
            material = units * p["material_cost"] * rng.normal(1.0, 0.03)
            labor = units * p["labor_hours"] * rng.normal(1.04, 0.03)  # rework, setup
            machine = units * p["machine_hours"] * rng.normal(1.02, 0.03)
            rows.append(
                {
                    "month": month,
                    "product_id": product_id,
                    "units_produced": units,
                    "revenue": round(float(revenue), 2),
                    "material_spend": round(float(material), 2),
                    "labor_hours_used": round(float(labor), 1),
                    "machine_hours_used": round(float(machine), 1),
                }
            )
    return pd.DataFrame(rows, columns=HISTORY_COLUMNS)


def write_sample_files(target_dir: Path = SAMPLE_DIR) -> list[Path]:
    """Write the CSV and Excel sample files. Returns the paths written."""
    target_dir.mkdir(parents=True, exist_ok=True)
    products = sample_products_frame()
    resources = resources_frame(SAMPLE_RESOURCES)
    history = build_production_history()

    paths = []
    for name, frame in (
        ("products.csv", products),
        ("resources.csv", resources),
        ("production_history.csv", history),
    ):
        path = target_dir / name
        frame.to_csv(path, index=False, lineterminator="\n")
        paths.append(path)

    notes = pd.DataFrame({"notes": [
        SYNTHETIC_NOTICE,
        "Sheet 'products' and optional sheet 'resources' can be uploaded on the Data page.",
        "Sheet 'production_history' is the 12-month history shown on the Dashboard.",
    ]})
    xlsx_path = target_dir / "sample_dataset.xlsx"
    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        products.to_excel(writer, sheet_name="products", index=False)
        resources.to_excel(writer, sheet_name="resources", index=False)
        history.to_excel(writer, sheet_name="production_history", index=False)
        notes.to_excel(writer, sheet_name="notes", index=False)
    paths.append(xlsx_path)

    # A small file with deliberate mistakes, for trying the upload validator.
    invalid = products.head(3).copy().astype(object)
    invalid.loc[0, "unit_price"] = "abc"
    invalid.loc[1, "labor_hours"] = -2.0
    invalid.loc[2, "product_id"] = invalid.loc[0, "product_id"]
    invalid.loc[0, "min_units"] = 300.0  # above its demand cap of 260
    invalid_path = target_dir / "invalid_products_example.csv"
    invalid.to_csv(invalid_path, index=False, lineterminator="\n")
    paths.append(invalid_path)
    return paths
