"""Solver tests against problems small enough to solve by hand."""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy.optimize import linprog

from optimizer.model import Product, ProductionProblem, Resources
from optimizer.solver import (
    STATUS_NAMES,
    evaluate_plan,
    objective_value,
    objective_without_constraint,
    solve,
)
from tests.conftest import wyndor


def test_wyndor_optimum_matches_corner_point_enumeration(wyndor_problem):
    """Corner points of the feasible region and their profit Z = 3 x1 + 5 x2:

        (0, 0) -> 0      (4, 0) -> 12     (4, 3) -> 27
        (2, 6) -> 36     (0, 6) -> 30

    The best corner is (2, 6) with Z = 36. Plant 1 has slack 4 - 2 = 2;
    plants 2 and 3 are binding.
    """
    sol = solve(wyndor_problem)
    assert sol.status == "optimal"
    assert sol.objective == pytest.approx(36.0)
    assert sol.units() == pytest.approx({"A": 2.0, "B": 6.0})
    cons = sol.constraints.set_index("key")
    assert cons.loc["labor", "slack"] == pytest.approx(2.0)
    assert not cons.loc["labor", "binding"]
    assert cons.loc["machine", "binding"] and cons.loc["material", "binding"]
    assert set(sol.binding_keys()) == {"machine", "material"}


def test_wyndor_shadow_prices_have_textbook_values_and_signs(wyndor_problem):
    """Textbook duals: y1 = 0, y2 = 1.5, y3 = 1.

    Check by hand: with plant 2 at 13 hours, x2 = 6.5 and 3 x1 = 18 - 13 = 5,
    so x1 = 5/3 and Z = 5 + 32.5 = 37.5, i.e. +1.5. With plant 3 at 19,
    x2 = 6 and x1 = 7/3, Z = 7 + 30 = 37, i.e. +1.
    """
    sol = solve(wyndor_problem)
    y = sol.shadow_prices()
    assert y["labor"] == pytest.approx(0.0)
    assert y["machine"] == pytest.approx(1.5)
    assert y["material"] == pytest.approx(1.0)

    # HiGHS reports d(min objective)/d(b), which is negative here; the app flips the sign.
    raw = linprog(-wyndor_problem.unit_margins(), A_ub=wyndor_problem.usage_matrix(),
                  b_ub=wyndor_problem.rhs(), bounds=wyndor_problem.bounds(), method="highs")
    assert raw.ineqlin.marginals[1] == pytest.approx(-1.5)
    assert raw.fun == pytest.approx(-36.0)


@pytest.mark.parametrize("field,expected_delta", [
    ("labor_hours_available", 0.0),
    ("machine_hours_available", 1.5),
    ("material_budget", 1.0),
])
def test_shadow_price_equals_change_from_resolving_with_one_more_unit(wyndor_problem, field, expected_delta):
    base = solve(wyndor_problem).objective
    bumped = wyndor_problem.with_resource(field, getattr(wyndor_problem.resources, field) + 1)
    assert objective_value(bumped) - base == pytest.approx(expected_delta)


def test_shadow_prices_match_resolve_on_sample_data(sample_problem):
    sol = solve(sample_problem)
    assert sol.is_optimal
    for row in sol.constraints.itertuples(index=False):
        field = {"labor": "labor_hours_available", "machine": "machine_hours_available",
                 "material": "material_budget"}[row.key]
        # A small step stays inside the range where the shadow price is valid.
        step = 1.0
        bumped = objective_value(sample_problem.with_resource(field, row.available + step))
        assert (bumped - sol.objective) / step == pytest.approx(row.shadow_price, rel=1e-6, abs=1e-6)


def test_demand_cap_value_from_upper_bound_dual():
    """Replace plant 2 with a demand cap x2 <= 6 (plant 2 made non-binding).

    The optimum is still (2, 6). Raising the cap to 7 gives x2 = 7 and
    3 x1 = 18 - 14 = 4, so x1 = 4/3 and Z = 4 + 35 = 39: each extra unit of
    demand is worth 39 - 36 = 3 (= 5 - 1 x 2, margin minus plant-3 value).
    """
    problem = wyndor(plant2=1000.0, cap_b=6.0)
    sol = solve(problem)
    plan = sol.plan.set_index("product_id")
    assert sol.objective == pytest.approx(36.0)
    assert plan.loc["B", "position"] == "At demand cap"
    assert plan.loc["B", "demand_value"] == pytest.approx(3.0)
    assert plan.loc["B", "reduced_cost"] == pytest.approx(3.0)
    bumped = objective_value(problem.with_product_value("B", "max_units", 7.0))
    assert bumped - sol.objective == pytest.approx(3.0)


def test_minimum_commitment_cost_from_lower_bound_dual():
    """Force x1 >= 3: x2 = min(6, (18 - 9) / 2) = 4.5, Z = 9 + 22.5 = 31.5.
    With x1 >= 4: x2 = 3, Z = 12 + 15 = 27, so each committed unit costs 4.5."""
    problem = wyndor(min_a=3.0)
    sol = solve(problem)
    plan = sol.plan.set_index("product_id")
    assert sol.objective == pytest.approx(31.5)
    assert plan.loc["A", "position"] == "At minimum commitment"
    assert plan.loc["A", "commitment_cost"] == pytest.approx(4.5)
    assert plan.loc["A", "reduced_cost"] == pytest.approx(-4.5)
    assert objective_value(problem.with_product_value("A", "min_units", 4.0)) == pytest.approx(27.0)


def test_reduced_costs_agree_with_bound_duals_on_sample(sample_problem):
    sol = solve(sample_problem)
    for row in sol.plan.itertuples(index=False):
        if row.position == "At demand cap":
            assert row.reduced_cost == pytest.approx(row.demand_value, abs=1e-6)
        elif row.position in ("At minimum commitment", "Not produced"):
            assert row.reduced_cost == pytest.approx(-row.commitment_cost, abs=1e-6)
        else:
            assert row.reduced_cost == pytest.approx(0.0, abs=1e-6)


def test_infeasible_when_minimums_need_more_labor_than_available():
    """x1 >= 5 needs 5 plant-1 hours but only 4 exist."""
    sol = solve(wyndor(min_a=5.0))
    assert sol.status == "infeasible"
    assert sol.objective is None
    assert sol.plan.empty
    assert any("labor hours" in d and "Add at least 1.0" in d for d in sol.diagnosis)


def test_cap_below_minimum_is_reported_as_infeasible_not_an_exception():
    problem = wyndor().with_product_value("B", "min_units", 5.0).with_product_value("B", "max_units", 2.0)
    sol = solve(problem)
    assert sol.status == "infeasible"
    assert any("below the minimum commitment" in d for d in sol.diagnosis)


def test_unbounded_when_profitable_product_uses_nothing_and_has_no_cap():
    products = (
        Product("A", "Product A", 6.0, 3.0, 0.0, 1.0, 0.0),
        Product("FREE", "Free Widget", 10.0, 0.0, 1.0, 0.0, 0.0),  # margin 9, uses nothing
    )
    problem = ProductionProblem(products, Resources(4, 12, 18, 0, 0, 1.0))
    sol = solve(problem)
    assert sol.status == "unbounded"
    assert any("Free Widget" in d and "unlimited" in d for d in sol.diagnosis)
    assert objective_value(problem) is None


def test_status_code_names_cover_linprog_codes():
    assert STATUS_NAMES == {0: "optimal", 1: "iteration_limit", 2: "infeasible", 3: "unbounded",
                            4: "numerical_error"}


def test_integer_solution_matches_hand_enumeration():
    """With plant 3 = 17 the LP optimum is x = (5/3, 6), Z = 35.
    Whole-unit plans with x2 = 6 need 3 x1 <= 5, so x1 <= 1: (1, 6) gives 33.
    (2, 5) gives 31 and (3, 4) gives 29, so the integer optimum is (1, 6), Z = 33."""
    problem = wyndor(plant3=17.0)
    lp = solve(problem)
    assert lp.objective == pytest.approx(35.0)
    assert lp.units()["A"] == pytest.approx(5 / 3)
    milp = solve(problem, integer=True)
    assert milp.is_optimal and milp.integer
    assert milp.objective == pytest.approx(33.0)
    assert milp.units() == pytest.approx({"A": 1.0, "B": 6.0})
    assert milp.constraints["shadow_price"].isna().all()


def test_objective_without_constraint_is_exact_ceiling(wyndor_problem):
    """Drop plant 3: x1 <= 4 and x2 <= 6 give Z = 12 + 30 = 42."""
    assert objective_without_constraint(wyndor_problem, "material") == pytest.approx(42.0)
    # Dropping plant 1 (non-binding) changes nothing.
    assert objective_without_constraint(wyndor_problem, "labor") == pytest.approx(36.0)
    with pytest.raises(KeyError):
        objective_without_constraint(wyndor_problem, "nope")


def test_objective_value_matches_full_solve(sample_problem):
    assert objective_value(sample_problem) == pytest.approx(solve(sample_problem).objective)


def test_evaluate_plan_reports_contribution_and_violations(wyndor_problem):
    ok = evaluate_plan(wyndor_problem, {"A": 2, "B": 6})
    assert ok["feasible"] and ok["objective"] == pytest.approx(36.0)
    bad = evaluate_plan(wyndor_problem, {"A": 4, "B": 6})  # 3*4 + 2*6 = 24 > 18
    assert not bad["feasible"]
    assert any("Material budget" in v for v in bad["violations"])


def test_plan_totals_are_consistent(sample_problem):
    sol = solve(sample_problem)
    assert sol.plan["contribution"].sum() == pytest.approx(sol.objective)
    used = sol.constraints.set_index("key")["used"]
    assert sol.plan["labor_hours_used"].sum() == pytest.approx(used["labor"])
    assert sol.plan["material_spend"].sum() == pytest.approx(used["material"])
    assert (sol.constraints["slack"] >= -1e-6).all()
    x = sol.plan["units"].to_numpy()
    assert np.all(x >= sample_problem.lower_bounds() - 1e-9)
    assert np.all(x <= sample_problem.upper_bounds() + 1e-9)


def test_non_finite_input_is_rejected():
    problem = wyndor().with_resource("labor_hours_available", math.inf)
    assert solve(problem).status == "invalid_input"
