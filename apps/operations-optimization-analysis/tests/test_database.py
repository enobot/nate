"""SQLite round-trips, constraints, and reporting queries (temporary databases only)."""

from __future__ import annotations

import sqlite3

import pandas as pd
import pytest

from data import database as db
from data import queries
from data.sample_data import SAMPLE_DATASET_NAME, build_production_history, sample_products_frame, sample_resources
from optimizer.solver import solve
from tests.conftest import wyndor


def _count(path, table):
    with db.connect(path) as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]  # table names are test constants


def test_init_seeds_sample_data_exactly_once(tmp_db):
    db.init_db(tmp_db)  # second call must not duplicate anything
    datasets = db.list_datasets(tmp_db)
    assert list(datasets["name"]) == [SAMPLE_DATASET_NAME]
    assert datasets.loc[0, "products"] == 6 and datasets.loc[0, "is_synthetic"] == 1
    assert _count(tmp_db, "scenarios") == 3
    assert _count(tmp_db, "optimization_runs") == 3
    assert _count(tmp_db, "production_history") == len(build_production_history())


def test_seeded_scenario_results_equal_a_fresh_solve(tmp_db):
    scenarios = db.list_scenarios(tmp_db)
    for row in scenarios.itertuples(index=False):
        _, problem = db.load_scenario(tmp_db, row.scenario_id)
        assert row.total_contribution == pytest.approx(solve(problem).objective)


def test_dataset_round_trip(empty_db):
    dataset_id = db.save_dataset(empty_db, "Round trip", sample_products_frame(), sample_resources(),
                                 source="upload", is_synthetic=True)
    meta, products, resources = db.load_dataset(empty_db, dataset_id)
    pd.testing.assert_frame_equal(products, sample_products_frame())
    assert resources == sample_resources()
    assert meta["source"] == "upload"


def test_dataset_name_rules(empty_db):
    db.save_dataset(empty_db, "Plant A", sample_products_frame(), sample_resources(), source="upload",
                    is_synthetic=False)
    with pytest.raises(db.StorageError, match="already exists"):
        db.save_dataset(empty_db, "Plant A", sample_products_frame(), sample_resources(), source="upload",
                        is_synthetic=False)
    with pytest.raises(db.StorageError, match="name must be"):
        db.save_dataset(empty_db, "=cmd()", sample_products_frame(), sample_resources(), source="upload",
                        is_synthetic=False)


def test_invalid_products_never_reach_the_database(empty_db):
    bad = sample_products_frame()
    bad.loc[0, "unit_price"] = -1.0
    with pytest.raises(db.StorageError, match="cannot be negative"):
        db.save_dataset(empty_db, "Bad", bad, sample_resources(), source="upload", is_synthetic=False)
    assert _count(empty_db, "datasets") == 0


def test_check_constraints_reject_negative_values_at_the_database_level(tmp_db):
    with db.connect(tmp_db) as conn, pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO dataset_products (dataset_id, position, product_id, product_name, unit_price, "
            "material_cost, other_variable_cost, labor_hours, machine_hours, min_units, max_units) "
            "VALUES (1, 99, 'X', 'X', -5, 0, 0, 0, 0, 0, NULL)"
        )


def test_sample_dataset_cannot_be_deleted_but_uploads_can(tmp_db):
    with pytest.raises(db.StorageError):
        db.delete_dataset(tmp_db, db.sample_dataset_id(tmp_db))
    new_id = db.save_dataset(tmp_db, "Temp", sample_products_frame(), sample_resources(), source="upload",
                             is_synthetic=False)
    db.delete_dataset(tmp_db, new_id)
    with db.connect(tmp_db) as conn:
        left = conn.execute("SELECT COUNT(*) FROM dataset_products WHERE dataset_id = ?", (new_id,)).fetchone()[0]
    assert left == 0  # ON DELETE CASCADE removed the products


def test_scenario_round_trip_and_runs(tmp_db, sample_problem):
    sol = solve(sample_problem)
    scenario_id = db.save_scenario(tmp_db, "O'Brien's test plan", sample_problem, sol, notes="quote test")
    meta, loaded = db.load_scenario(tmp_db, scenario_id)
    assert meta["name"] == "O'Brien's test plan"  # quotes survive because values are bound
    assert loaded.to_json() == sample_problem.to_json()

    db.add_run(tmp_db, scenario_id, solve(loaded))
    row = db.list_scenarios(tmp_db).set_index("scenario_id").loc[scenario_id]
    assert row["runs"] == 2 and row["total_contribution"] == pytest.approx(sol.objective)


def test_scenario_overwrite_rules(tmp_db, wyndor_problem):
    db.save_scenario(tmp_db, "Same name", wyndor_problem)
    with pytest.raises(db.StorageError, match="already exists"):
        db.save_scenario(tmp_db, "Same name", wyndor_problem)
    changed = wyndor_problem.with_resource("machine_hours_available", 13.0)
    new_id = db.save_scenario(tmp_db, "Same name", changed, overwrite=True)
    _, loaded = db.load_scenario(tmp_db, new_id)
    assert loaded.resources.machine_hours_available == 13.0
    assert (db.list_scenarios(tmp_db)["name"] == "Same name").sum() == 1


def test_injection_style_names_are_rejected(tmp_db, wyndor_problem):
    with pytest.raises(db.StorageError):
        db.save_scenario(tmp_db, "x'; DROP TABLE scenarios; --", wyndor_problem)
    assert _count(tmp_db, "scenarios") == 3


def test_infeasible_scenario_is_stored_with_diagnosis(tmp_db):
    problem = wyndor(min_a=5.0)
    scenario_id = db.save_scenario(tmp_db, "Impossible", problem)
    row = db.list_scenarios(tmp_db).set_index("scenario_id").loc[scenario_id]
    assert row["status"] == "infeasible" and pd.isna(row["total_contribution"])
    with db.connect(tmp_db) as conn:
        diagnosis = conn.execute("SELECT diagnosis FROM optimization_runs WHERE scenario_id = ?",
                                 (scenario_id,)).fetchone()[0]
    assert "labor hours" in diagnosis


def test_delete_scenario_cascades(tmp_db, wyndor_problem):
    scenario_id = db.save_scenario(tmp_db, "Doomed", wyndor_problem)
    db.delete_scenario(tmp_db, scenario_id)
    with db.connect(tmp_db) as conn:
        runs = conn.execute("SELECT COUNT(*) FROM optimization_runs WHERE scenario_id = ?", (scenario_id,)).fetchone()[0]
        products = conn.execute("SELECT COUNT(*) FROM scenario_products WHERE scenario_id = ?", (scenario_id,)).fetchone()[0]
    assert runs == 0 and products == 0
    with pytest.raises(db.StorageError):
        db.delete_scenario(tmp_db, scenario_id)


def test_compare_scenarios_uses_latest_run(tmp_db):
    summary, products, constraints = db.compare_scenarios(tmp_db, [1, 2])
    assert list(summary["scenario_id"]) == [1, 2]
    assert len(products) == 12 and len(constraints) == 6
    # Totals in the run_products table add up to the stored total.
    for scenario_id, group in products.groupby("scenario_id"):
        total = summary.set_index("scenario_id").loc[scenario_id, "total_contribution"]
        assert group["contribution"].sum() == pytest.approx(total)


def test_failed_transaction_leaves_no_partial_rows(tmp_db, wyndor_problem):
    before = _count(tmp_db, "scenarios")
    with pytest.raises(RuntimeError):
        with db.connect(tmp_db) as conn, db.transaction(conn):
            db.save_scenario(None, "Half written", wyndor_problem, conn=conn)
            raise RuntimeError("simulated crash mid-transaction")
    assert _count(tmp_db, "scenarios") == before


# ---------------------------------------------------------------- reports
def test_every_report_runs(tmp_db):
    for report in queries.REPORTS:
        frame = queries.run_report(tmp_db, report.key, {"scenario_id": 1, "dataset_id": 1})
        assert isinstance(frame, pd.DataFrame)


def test_leaderboard_is_sorted_by_contribution(tmp_db):
    frame = queries.run_report(tmp_db, "scenario_leaderboard", {"limit": 10})
    assert list(frame["total_contribution"]) == sorted(frame["total_contribution"], reverse=True)
    assert len(queries.run_report(tmp_db, "scenario_leaderboard", {"limit": 1})) == 1


def test_sql_margins_match_python_margins(tmp_db, sample_problem):
    frame = queries.run_report(tmp_db, "product_economics", {"dataset_id": 1}).set_index("product_id")
    for product, margin in zip(sample_problem.products, sample_problem.unit_margins()):
        # SQL rounds to cents, so allow half a cent.
        assert frame.loc[product.product_id, "unit_margin"] == pytest.approx(margin, abs=0.005)


def test_monthly_history_report_matches_pandas(tmp_db):
    frame = queries.run_report(tmp_db, "monthly_history", {"start_month": "2026-01", "end_month": "2026-03"})
    history = build_production_history()
    expected = history[history["month"].between("2026-01", "2026-03")].groupby("month")["units_produced"].sum()
    assert list(frame["month"]) == list(expected.index)
    assert list(frame["units_produced"]) == list(expected)


@pytest.mark.parametrize("key,params,fragment", [
    ("monthly_history", {"start_month": "2025-11' OR '1'='1", "end_month": "2026-10"}, "must look like"),
    ("monthly_history", {"start_month": "2026-10", "end_month": "2025-11"}, "start month"),
    ("scenario_leaderboard", {"limit": 0}, "at least 1"),
    ("scenario_product_mix", {"scenario_id": "1; DROP TABLE scenarios"}, "whole number"),
])
def test_report_parameters_are_validated(tmp_db, key, params, fragment):
    with pytest.raises(queries.ReportParameterError, match=fragment):
        queries.run_report(tmp_db, key, params)


def test_schema_listing(tmp_db):
    schema = db.table_schema(tmp_db)
    assert {"datasets", "scenarios", "optimization_runs", "run_products", "run_constraints",
            "production_history"} <= set(schema["table"])
