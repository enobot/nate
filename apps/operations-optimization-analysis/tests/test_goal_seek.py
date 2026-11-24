"""Goal Seek accuracy and unreachable-target handling."""

from __future__ import annotations

import pytest

from optimizer.goal_seek import default_search_range, goal_seek
from optimizer.parameters import Parameter
from optimizer.solver import objective_value
from tests.conftest import wyndor


def test_goal_seek_machine_hours_hits_hand_computed_value(wyndor_problem):
    """Z(b2) = 36 + 1.5 (b2 - 12) on 6 <= b2 <= 18, so Z = 37.5 needs b2 = 13."""
    result = goal_seek(wyndor_problem, Parameter("resource", "machine_hours_available"), 37.5)
    assert result.found
    assert result.value == pytest.approx(13.0, abs=1e-8)
    assert result.achieved == pytest.approx(37.5, abs=1e-8)
    assert result.change == pytest.approx(1.0, abs=1e-8)


def test_goal_seek_price_hits_hand_computed_value(wyndor_problem):
    """For margin c2 >= 2 the plan stays (2, 6), so Z = 3*2 + 6 c2. Z = 42 needs c2 = 6,
    i.e. a product B price of 6 + 2 (material) = 8."""
    result = goal_seek(wyndor_problem, Parameter("product", "unit_price", "B"), 42.0)
    assert result.found
    assert result.value == pytest.approx(8.0, abs=1e-8)
    assert objective_value(wyndor_problem.with_product_value("B", "unit_price", result.value)) == pytest.approx(42.0)


def test_goal_seek_cost_input_moves_in_the_right_direction(sample_problem):
    """A lower target via labor rate needs a higher rate; verify by re-solving."""
    base = objective_value(sample_problem)
    target = base - 5000.0
    param = Parameter("resource", "labor_rate")
    result = goal_seek(sample_problem, param, target)
    assert result.found
    assert result.value > sample_problem.resources.labor_rate
    assert objective_value(param.apply(sample_problem, result.value)) == pytest.approx(target, abs=1e-6)


def test_unreachable_target_explains_the_ceiling(wyndor_problem):
    """Plant 1 is not binding, so more labor hours never raise Z above 36."""
    result = goal_seek(wyndor_problem, Parameter("resource", "labor_hours_available"), 100.0)
    assert not result.found
    assert result.value is None
    assert result.ceiling == pytest.approx(36.0)
    assert "tops out at $36.00" in result.message


def test_target_already_exceeded_everywhere(wyndor_problem):
    result = goal_seek(wyndor_problem, Parameter("resource", "labor_hours_available"), 5.0,
                       low=3.0, high=10.0)
    assert not result.found
    assert "stays above" in result.message


def test_infeasible_low_end_is_trimmed_to_the_feasibility_boundary():
    """With x1 >= 3 the model needs at least 3 plant-1 hours; the search starts there.

    HiGHS accepts constraint violations up to its primal feasibility tolerance
    (1e-7), so the boundary it reports can sit up to ~1e-7 below 3.
    """
    problem = wyndor(min_a=3.0)
    result = goal_seek(problem, Parameter("resource", "labor_hours_available"), 31.5, low=0.0, high=10.0)
    assert result.search_low == pytest.approx(3.0, abs=1e-6)
    assert result.search_low <= 3.0
    assert result.found


def test_invalid_search_range_is_rejected(wyndor_problem):
    with pytest.raises(ValueError):
        goal_seek(wyndor_problem, Parameter("resource", "machine_hours_available"), 40.0, low=10.0, high=5.0)
    with pytest.raises(ValueError):
        goal_seek(wyndor_problem, Parameter("resource", "machine_hours_available"), float("nan"))


def test_default_search_range_is_sensible(sample_problem):
    low, high = default_search_range(Parameter("resource", "labor_hours_available"), sample_problem)
    assert low == 0.0 and high == pytest.approx(5 * 2800.0)
    low, high = default_search_range(Parameter("resource", "material_cost_multiplier"), sample_problem)
    assert 0 < low < 1 < high <= 10
