"""Ranging, sweeps and tornado analysis."""

from __future__ import annotations

import math

import numpy as np
import pytest

from optimizer.parameters import Parameter, sweepable_parameters
from optimizer.sensitivity import price_ranges, rhs_ranges, sweep, sweep_values, tornado
from optimizer.solver import objective_value, solve
from tests.conftest import wyndor

TOL = 1e-3


def test_rhs_ranges_match_textbook_ranging(wyndor_problem):
    """Textbook right-hand-side ranges for Wyndor:

    * plant 2 (b2 = 12, y2 = 1.5): x2 = b2/2 and x1 = (18 - b2)/3 must stay in
      [0, 4], so 6 <= b2 <= 18.
    * plant 3 (b3 = 18, y3 = 1): x1 = (b3 - 12)/3 in [0, 4], so 12 <= b3 <= 24.
    * plant 1 (b1 = 4, slack 2, y1 = 0): valid for b1 >= 2, no upper limit.
    """
    ranges = {r.key: r for r in rhs_ranges(wyndor_problem)}
    assert ranges["machine"].shadow_price == pytest.approx(1.5)
    assert ranges["machine"].lower == pytest.approx(6.0, abs=TOL)
    assert ranges["machine"].upper == pytest.approx(18.0, abs=TOL)
    assert ranges["material"].lower == pytest.approx(12.0, abs=TOL)
    assert ranges["material"].upper == pytest.approx(24.0, abs=TOL)
    assert ranges["labor"].lower == pytest.approx(2.0, abs=TOL)
    assert math.isinf(ranges["labor"].upper)
    assert ranges["machine"].allowable_increase == pytest.approx(6.0, abs=TOL)
    assert ranges["machine"].allowable_decrease == pytest.approx(6.0, abs=TOL)


def test_rhs_range_reports_what_changes_past_the_upper_end(wyndor_problem):
    """Past b2 = 18, x1 would go negative, so product A drops out of the plan and plant 2
    stops binding (plant 3 alone limits x2 = 9)."""
    ranges = {r.key: r for r in rhs_ranges(wyndor_problem)}
    assert "Product A drops out of the plan" in ranges["machine"].next_limit
    assert "Machine hours stops being a limit" in ranges["machine"].next_limit
    # Past b3 = 24, x1 reaches 4 and plant 1 becomes binding.
    assert "Labor hours also becomes fully used" in ranges["material"].next_limit


def test_price_ranges_match_textbook_objective_ranging(wyndor_problem):
    """Textbook: (2, 6) stays optimal for 0 <= c1 <= 7.5 and c2 >= 2.
    Price = margin + material cost here, so price A in [3, 10.5] and price B >= 4."""
    ranges = {r.product_id: r for r in price_ranges(wyndor_problem)}
    assert ranges["A"].lower_price == pytest.approx(3.0, abs=TOL)
    assert ranges["A"].upper_price == pytest.approx(10.5, abs=TOL)
    assert ranges["B"].lower_price == pytest.approx(4.0, abs=TOL)
    assert math.isinf(ranges["B"].upper_price)


def test_rhs_range_is_consistent_with_resolves_on_sample(sample_problem):
    base = solve(sample_problem)
    for r in rhs_ranges(sample_problem, base):
        if r.shadow_price <= 0 or math.isinf(r.upper):
            continue
        field = {"labor": "labor_hours_available", "machine": "machine_hours_available",
                 "material": "material_budget"}[r.key]
        inside = 0.5 * (r.current + r.upper)
        z_inside = objective_value(sample_problem.with_resource(field, inside))
        assert z_inside == pytest.approx(base.objective + r.shadow_price * (inside - r.current), rel=1e-7)
        beyond = r.upper + 0.05 * (r.upper - r.current) + 1.0
        z_beyond = objective_value(sample_problem.with_resource(field, beyond))
        # Past the breakpoint the extra resource is worth less than the shadow price.
        assert z_beyond < base.objective + r.shadow_price * (beyond - r.current) - 1e-6


def test_not_produced_product_enters_plan_just_above_its_upper_price(sample_problem):
    base = solve(sample_problem)
    for r in price_ranges(sample_problem, base):
        row = base.plan.set_index("product_id").loc[r.product_id]
        if row["position"] != "Not produced" or math.isinf(r.upper_price):
            continue
        # The range end equals price + |reduced cost| (the dual-based threshold).
        assert r.upper_price == pytest.approx(r.current_price - row["reduced_cost"], abs=1e-3)
        above = solve(sample_problem.with_product_value(r.product_id, "unit_price", r.upper_price + 0.5))
        assert above.units()[r.product_id] > 0
        below = solve(sample_problem.with_product_value(r.product_id, "unit_price", r.upper_price - 0.5))
        assert below.units()[r.product_id] == pytest.approx(0.0)


def test_sweep_rows_equal_individual_solves(wyndor_problem):
    param = Parameter("resource", "machine_hours_available")
    values = [0.0, 6.0, 12.0, 18.0, 30.0]
    frame = sweep(wyndor_problem, param, values)
    assert list(frame["value"]) == values
    for value, z in zip(frame["value"], frame["objective"]):
        assert z == pytest.approx(objective_value(param.apply(wyndor_problem, value)))
    # b2 = 30: plant 2 allows x2 <= 15, so plant 3 is the only real limit. Per unit of
    # plant 3, x1 earns 3/3 = 1 and x2 earns 5/2 = 2.5, so all of it goes to x2:
    # x1 = 0, x2 = 9, Z = 45.
    assert frame.loc[frame["value"] == 30.0, "objective"].iloc[0] == pytest.approx(45.0)
    assert "shadow:machine" in frame and "units:A" in frame


def test_sweep_marks_infeasible_points():
    problem = wyndor(min_a=3.0)  # needs 3 labor hours
    frame = sweep(problem, Parameter("resource", "labor_hours_available"), [1.0, 3.0, 4.0])
    assert list(frame["status"]) == ["infeasible", "optimal", "optimal"]
    assert math.isnan(frame["objective"].iloc[0])


def test_sweep_values_clip_at_zero_and_include_current():
    values = sweep_values(100.0, -150, 50, 5)
    assert values.min() == 0.0 and values.max() == pytest.approx(150.0)
    assert 100.0 in values
    with pytest.raises(ValueError):
        sweep_values(100.0, 10, 10, 5)
    with pytest.raises(ValueError):
        sweep_values(100.0, -10, 10, 1)


def test_tornado_is_sorted_and_signs_make_sense(sample_problem):
    params = [Parameter("resource", "labor_hours_available"), Parameter("resource", "labor_rate"),
              Parameter("resource", "machine_hours_available")]
    frame = tornado(sample_problem, params, pct=10)
    assert list(frame["swing"]) == sorted(frame["swing"])
    by_key = frame.set_index("key")
    assert by_key.loc["resource:labor_hours_available", "change_high"] > 0
    assert by_key.loc["resource:labor_rate", "change_high"] < 0
    # Machine hours are not binding, so +10% changes nothing.
    assert by_key.loc["resource:machine_hours_available", "change_high"] == pytest.approx(0.0, abs=1e-6)


def test_sweepable_parameters_skip_zero_and_missing_values(sample_problem):
    keys = {p.key for p in sweepable_parameters(sample_problem)}
    assert "resource:labor_hours_available" in keys
    assert "product:BK-300:min_units" not in keys  # minimum is 0
    assert "product:DT-100:min_units" in keys


def test_parameter_keys_round_trip_and_reject_bad_values(sample_problem):
    p = Parameter("product", "unit_price", "DT-100")
    assert Parameter.from_key(p.key) == p
    with pytest.raises(ValueError):
        p.apply(sample_problem, -1.0)
    with pytest.raises(ValueError):
        Parameter("resource", "not_a_field")
    with pytest.raises(ValueError):
        Parameter.from_key("garbage")
    assert np.isclose(p.apply(sample_problem, 700.0).product("DT-100").unit_price, 700.0)
