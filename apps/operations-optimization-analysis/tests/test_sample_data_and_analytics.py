"""Sample data reproducibility, history analytics, recommendations, and chart builders."""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import pytest

from data.analytics import history_matches, monthly_summary, recent_average_units
from data.sample_data import (
    SAMPLE_DIR,
    build_production_history,
    resources_frame,
    sample_products_frame,
    sample_resources,
)
from optimizer.recommendations import recommendations
from optimizer.sensitivity import price_ranges, rhs_ranges, sweep, tornado
from optimizer.parameters import Parameter
from optimizer.solver import evaluate_plan, solve
from tests.conftest import wyndor
from ui import charts
from ui.theme import color_map


# ------------------------------------------------------------- sample data
def test_committed_sample_files_match_the_builder_code():
    pd.testing.assert_frame_equal(pd.read_csv(SAMPLE_DIR / "products.csv"), sample_products_frame(),
                                  check_dtype=False)
    pd.testing.assert_frame_equal(pd.read_csv(SAMPLE_DIR / "resources.csv"), resources_frame(sample_resources()),
                                  check_dtype=False)
    pd.testing.assert_frame_equal(pd.read_csv(SAMPLE_DIR / "production_history.csv"), build_production_history(),
                                  check_dtype=False)


def test_history_is_reproducible_from_its_seed():
    pd.testing.assert_frame_equal(build_production_history(), build_production_history())
    assert not build_production_history(seed=1).equals(build_production_history())


def test_sample_problem_has_two_bottlenecks_and_spare_machine_time(sample_problem):
    """The sample data is meant to show binding and non-binding constraints together."""
    sol = solve(sample_problem)
    assert sol.is_optimal
    assert set(sol.binding_keys()) == {"labor", "material"}
    positions = set(sol.plan["position"])
    assert {"At demand cap", "Between limits", "At minimum commitment", "Not produced"} <= positions


# ---------------------------------------------------------------- analytics
def test_history_analytics(sample_problem):
    history = build_production_history()
    assert history_matches(history, sample_problem)
    assert not history_matches(history, wyndor())
    monthly = monthly_summary(history, sample_problem)
    assert len(monthly) == 12
    assert monthly["revenue"].sum() == pytest.approx(history["revenue"].sum())
    first = history[history["month"] == "2025-11"]
    r = sample_problem.resources
    other = {p.product_id: p.other_variable_cost for p in sample_problem.products}
    expected = (first["revenue"] - first["material_spend"]
                - first["units_produced"] * first["product_id"].map(other)
                - first["labor_hours_used"] * r.labor_rate - first["machine_hours_used"] * r.machine_rate).sum()
    assert monthly.loc[0, "est_contribution"] == pytest.approx(expected)

    recent = recent_average_units(history, months=3)
    last3 = history[history["month"].isin(["2026-08", "2026-09", "2026-10"])]
    assert recent["DT-100"] == pytest.approx(last3[last3["product_id"] == "DT-100"]["units_produced"].mean())


def test_optimal_plan_beats_the_recent_mix(sample_problem):
    recent = recent_average_units(build_production_history())
    evaluation = evaluate_plan(sample_problem, recent)
    assert evaluation["feasible"]  # the old mix fits, so the comparison is fair
    assert solve(sample_problem).objective >= evaluation["objective"]


# ---------------------------------------------------------- recommendations
def test_recommendations_quote_numbers_from_the_solution(wyndor_problem):
    sol = solve(wyndor_problem)
    recs = recommendations(wyndor_problem, sol, rhs_ranges(wyndor_problem, sol), price_ranges(wyndor_problem, sol))
    text = {r.kind: [] for r in recs}
    for r in recs:
        text[r.kind].append(r.text)
    assert "$36" in text["summary"][0]
    machine = next(t for t in text["bottleneck"] if t.startswith("Machine hours"))
    assert "$1.50" in machine and "up to 18.0 hours" in machine and "down to about 6.0 hours" in machine
    material = next(t for t in text["bottleneck"] if t.startswith("Material budget"))
    assert "$1,000 of contribution" in material
    assert any("Labor hours is not a constraint" in t and "2.0 hours idle" in t for t in text["slack"])


def test_recommendations_for_an_infeasible_model_list_the_fix():
    problem = wyndor(min_a=5.0)
    recs = recommendations(problem, solve(problem))
    assert recs[0].kind == "problem" and "Infeasible" in recs[0].text
    assert any("Add at least 1.0 labor hours" in r.text for r in recs)


def test_not_produced_recommendation_threshold_is_real(sample_problem):
    sol = solve(sample_problem)
    recs = [r for r in recommendations(sample_problem, sol) if r.kind == "not_produced"]
    assert recs, "the sample data has a product that is not produced"
    row = sol.plan.loc[sol.plan["position"] == "Not produced"].iloc[0]
    threshold = sample_problem.product(row["product_id"]).unit_price - row["reduced_cost"]
    assert f"${threshold:,.2f}" in " ".join(r.text for r in recs)
    entered = solve(sample_problem.with_product_value(row["product_id"], "unit_price", threshold + 1.0))
    assert entered.units()[row["product_id"]] > 0


def test_whole_unit_recommendation_reports_the_gap():
    problem = wyndor(plant3=17.0)
    recs = recommendations(problem, solve(problem), integer_solution=solve(problem, integer=True))
    whole = [r for r in recs if r.kind == "whole_units"]
    assert whole and "$33" in whole[0].text and "$2" in whole[0].text


# ------------------------------------------------------------------ charts
def test_chart_builders_use_the_solution_data(sample_problem):
    sol = solve(sample_problem)
    colors = color_map(sample_problem.product_ids)
    fig = charts.plan_chart(sol.plan, colors)
    assert isinstance(fig, go.Figure)
    assert list(fig.data[0].y) == pytest.approx(list(sol.plan["units"]))
    util = charts.utilization_chart(sol.constraints)
    assert list(util.data[0].x) == pytest.approx(list(sol.constraints["utilization"] * 100))
    margin = charts.product_margin_chart(sample_problem.products_frame(include_economics=True), colors)
    assert sorted(margin.data[0].x) == pytest.approx(sorted(sample_problem.unit_margins()))

    param = Parameter("resource", "labor_hours_available")
    frame = sweep(sample_problem, param, [2000.0, 2800.0, 3600.0])
    assert len(charts.sweep_objective_chart(frame, "Labor", 2800.0, False).data) >= 1
    assert len(charts.sweep_units_chart(frame, sample_problem.products_frame(), colors, "Labor", False).data) == 6
    assert len(charts.sweep_shadow_chart(frame, "Labor", False).data) == 3
    tor = tornado(sample_problem, [param], 10)
    assert len(charts.tornado_chart(tor, 10).data) == 2


def test_colors_follow_entities_not_rank():
    first = color_map(["A", "B", "C"])
    assert color_map(["A", "B", "C", "D"])["B"] == first["B"]
    assert len(set(color_map([str(i) for i in range(8)]).values())) == 8
