"""Input validation for product tables and resource settings."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from data.sample_data import sample_products_frame, sample_resources
from optimizer.validation import (
    MAX_PRODUCTS,
    InputValidationError,
    build_problem,
    economic_warnings,
    validate_products,
    validate_resources,
)


def _raw_sample() -> pd.DataFrame:
    """The sample table as text, the way pandas reads a CSV with dtype=str."""
    return sample_products_frame().astype(str)


def test_valid_sample_passes_and_is_typed():
    report = validate_products(_raw_sample())
    assert report.ok, report.errors
    assert report.products["unit_price"].dtype == float
    assert list(report.products["product_id"]) == list(sample_products_frame()["product_id"])


def test_missing_required_columns_are_listed():
    df = _raw_sample().drop(columns=["labor_hours", "unit_price"])
    report = validate_products(df)
    assert not report.ok
    assert "unit_price" in report.errors[0] and "labor_hours" in report.errors[0]


def test_column_names_are_normalized():
    df = _raw_sample().rename(columns={"unit_price": " Unit Price ", "labor_hours": "Labor-Hours"})
    assert validate_products(df).ok


@pytest.mark.parametrize("column,value,fragment", [
    ("unit_price", "abc", "is not a number"),
    ("unit_price", "$1,200", "is not a number"),
    ("labor_hours", "-2", "cannot be negative"),
    ("material_cost", "inf", "finite"),
    ("machine_hours", "", "is empty"),
    ("unit_price", "1e12", "unrealistically large"),
])
def test_bad_numeric_cells_report_row_and_column(column, value, fragment):
    df = _raw_sample()
    df.loc[1, column] = value
    report = validate_products(df)
    assert not report.ok
    assert any(e.startswith("Row 3:") and column in e and fragment in e for e in report.errors), report.errors


def test_boolean_values_are_not_treated_as_numbers():
    df = sample_products_frame().astype(object)
    df.loc[0, "labor_hours"] = True
    assert any("not a number" in e for e in validate_products(df).errors)


def test_duplicate_ids_and_min_above_max_are_errors():
    df = _raw_sample()
    df.loc[2, "product_id"] = df.loc[0, "product_id"]
    df.loc[3, "min_units"] = "500"
    df.loc[3, "max_units"] = "100"
    errors = validate_products(df).errors
    assert any("duplicate of row 2" in e for e in errors)
    assert any("max_units (100) is less than min_units (500)" in e for e in errors)


@pytest.mark.parametrize("name", ["=HYPERLINK(\"http://x\")", "+cmd", "@SUM(A1)", "-1+2", "[link](http://x)", "<b>x</b>"])
def test_formula_and_markup_names_are_rejected(name):
    df = _raw_sample()
    df.loc[0, "product_name"] = name
    report = validate_products(df)
    assert not report.ok
    assert any("product_name" in e for e in report.errors)


def test_optional_columns_default_and_blank_rows_are_skipped():
    df = _raw_sample().drop(columns=["min_units"])
    df.loc[0, "max_units"] = ""
    df.loc[len(df)] = [""] * len(df.columns)
    report = validate_products(df)
    assert report.ok, report.errors
    assert (report.products["min_units"] == 0).all()
    assert math.isnan(report.products.loc[0, "max_units"])
    assert any("Skipped 1 empty row" in w for w in report.warnings)


def test_extra_columns_produce_a_warning():
    df = _raw_sample()
    df["supplier"] = "x"
    report = validate_products(df)
    assert report.ok and any("supplier" in w for w in report.warnings)


def test_too_many_rows_and_empty_table():
    big = pd.concat([_raw_sample()] * (MAX_PRODUCTS // 6 + 2), ignore_index=True)
    assert "Too many products" in validate_products(big).errors[0]
    assert validate_products(pd.DataFrame()).errors
    assert validate_products(None).errors
    assert validate_products(_raw_sample().head(0)).errors


def test_resources_validation():
    good = sample_resources().as_dict()
    resources, errors = validate_resources(good)
    assert errors == [] and resources == sample_resources()

    bad = dict(good, labor_hours_available=-5, machine_rate="fast", material_cost_multiplier=0)
    bad.pop("material_budget")
    resources, errors = validate_resources(bad)
    assert resources is None
    joined = " ".join(errors)
    assert "Labor hours available cannot be negative" in joined
    assert "Machine operating rate ($/hour) must be a number" in joined
    assert "Material budget ($) is missing" in joined
    assert "Material cost multiplier must be greater than 0" in joined

    missing_multiplier = dict(good)
    missing_multiplier.pop("material_cost_multiplier")
    resources, errors = validate_resources(missing_multiplier)
    assert errors == [] and resources.material_cost_multiplier == 1.0


def test_build_problem_raises_with_all_errors():
    df = _raw_sample()
    df.loc[0, "unit_price"] = "x"
    with pytest.raises(InputValidationError) as info:
        build_problem(df, dict(sample_resources().as_dict(), labor_rate=-1))
    assert len(info.value.errors) == 2


def test_economic_warnings_flag_loss_makers_and_unbounded_products():
    df = sample_products_frame()
    df.loc[0, "unit_price"] = 100.0  # far below its variable cost
    df.loc[len(df)] = ["FREE", "Free Widget", 10.0, 0.0, 1.0, 0.0, 0.0, 0.0, np.nan]
    problem = build_problem(df, sample_resources())
    warnings = economic_warnings(problem)
    assert any("Dining Table" in w and "minimum commitment" in w for w in warnings)
    assert any("Free Widget" in w and "unbounded" in w for w in warnings)
