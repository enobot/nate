"""Goal Seek: find the value of one input that produces a target contribution.

Excel's Goal Seek changes one cell until a formula hits a target. Here the
"formula" is the whole optimization: for a candidate input value v the model
is re-solved and f(v) = Z*(v) - target is evaluated. Optimal contribution
Z*(v) is continuous and monotone in each supported input (more capacity or a
higher price never hurts; higher costs never help), so a sign change of f
over the search interval guarantees a solution and scipy.optimize.brentq
finds it.

When the target cannot be reached the result says why, using numbers from
actual solves: the contribution at both ends of the search range and, for
capacity-type inputs, the ceiling with that limit removed entirely.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from scipy.optimize import brentq

from optimizer.model import CONSTRAINTS, ProductionProblem
from optimizer.parameters import Parameter
from optimizer.solver import objective_value, objective_without_constraint

FEASIBILITY_BISECTIONS = 60


@dataclass(frozen=True)
class GoalSeekResult:
    found: bool
    parameter_key: str
    parameter_label: str
    target: float
    current_value: float
    current_objective: float | None
    value: float | None  # input value that reaches the target
    achieved: float | None  # contribution re-solved at `value`
    search_low: float
    search_high: float
    objective_at_low: float | None
    objective_at_high: float | None
    ceiling: float | None  # best contribution from changing this input alone, when known
    iterations: int
    message: str

    @property
    def change(self) -> float | None:
        return None if self.value is None else self.value - self.current_value

    @property
    def change_pct(self) -> float | None:
        if self.value is None or self.current_value == 0:
            return None
        return 100.0 * (self.value - self.current_value) / self.current_value


def default_search_range(parameter: Parameter, problem: ProductionProblem) -> tuple[float, float]:
    current = parameter.current(problem) or 0.0
    high = max(5.0 * current, current + 1.0)
    if parameter.kind == "resource" and parameter.field == "material_cost_multiplier":
        high = min(10.0, high)
        return 0.01, high
    return 0.0, high


def capacity_ceiling(problem: ProductionProblem, parameter: Parameter) -> float | None:
    """Best contribution reachable by raising a capacity-type input without limit.

    Exact for resource availability (the constraint row is dropped) and for a
    demand cap (the cap is removed). Returns math.inf if removing the limit
    makes the model unbounded, None for other kinds of inputs.
    """
    if parameter.kind == "resource":
        for spec in CONSTRAINTS:
            if spec.resource_field == parameter.field:
                return objective_without_constraint(problem, spec.key)
        return None
    if parameter.field == "max_units":
        uncapped = problem.with_product_value(parameter.product_id, "max_units", None)
        z = objective_value(uncapped)
        return math.inf if z is None else z
    return None


def _format_value(parameter: Parameter, value: float) -> str:
    if parameter.is_money:
        return f"${value:,.2f}"
    if parameter.unit == "x":
        return f"{value:,.4f}x"
    return f"{value:,.2f} {parameter.unit}"


def goal_seek(
    problem: ProductionProblem,
    parameter: Parameter,
    target: float,
    *,
    low: float | None = None,
    high: float | None = None,
) -> GoalSeekResult:
    label = parameter.label(problem)
    phrase = parameter.phrase(problem)
    current = parameter.current(problem)
    if current is None:
        raise ValueError(f"{label} has no current value to start from")
    if not math.isfinite(target):
        raise ValueError("The target must be a finite number")

    default_low, default_high = default_search_range(parameter, problem)
    low = default_low if low is None else float(low)
    high = default_high if high is None else float(high)
    if low < 0 or high <= low:
        raise ValueError("The search range must satisfy 0 <= low < high")

    def z(v: float) -> float | None:
        return objective_value(parameter.apply(problem, v))

    current_z = z(current)
    z_low, z_high = z(low), z(high)

    def result(found: bool, message: str, value=None, achieved=None, iterations=0, ceiling=None):
        return GoalSeekResult(
            found=found,
            parameter_key=parameter.key,
            parameter_label=label,
            target=float(target),
            current_value=float(current),
            current_objective=current_z,
            value=value,
            achieved=achieved,
            search_low=low,
            search_high=high,
            objective_at_low=z_low,
            objective_at_high=z_high,
            ceiling=ceiling,
            iterations=iterations,
            message=message,
        )

    # Feasibility is monotone in every supported input, so if exactly one end
    # of the range is infeasible, bisect for the boundary and move that end.
    if z_low is None and z_high is None:
        return result(
            False,
            f"The model has no feasible plan anywhere between {_format_value(parameter, low)} and "
            f"{_format_value(parameter, high)}. Fix the infeasibility on the Optimizer page first.",
        )
    if z_low is None or z_high is None:
        good, bad = (high, low) if z_low is None else (low, high)
        for _ in range(FEASIBILITY_BISECTIONS):
            mid = 0.5 * (good + bad)
            if z(mid) is None:
                bad = mid
            else:
                good = mid
        if z_low is None:
            low, z_low = good, z(good)
        else:
            high, z_high = good, z(good)

    lo_z, hi_z = min(z_low, z_high), max(z_low, z_high)
    tol = 1e-9 * max(1.0, abs(target))

    if lo_z - tol <= target <= hi_z + tol:
        if abs(z_low - target) <= tol:
            return result(True, "The target is reached at the low end of the search range.", low, z_low)
        if abs(z_high - target) <= tol:
            return result(True, "The target is reached at the high end of the search range.", high, z_high)
        root, info = brentq(
            lambda v: z(v) - target, low, high, full_output=True, xtol=1e-10, rtol=1e-12, maxiter=200
        )
        achieved = z(root)
        direction = "raise" if root > current else "lower"
        if math.isclose(root, current, rel_tol=1e-9, abs_tol=1e-9):
            message = f"The current value of {phrase} already gives the target."
        else:
            message = (
                f"To reach a contribution of ${target:,.2f}, {direction} {phrase} from "
                f"{_format_value(parameter, current)} to {_format_value(parameter, root)} "
                "with everything else unchanged."
            )
        return result(info.converged, message, root, achieved, info.iterations)

    ceiling = capacity_ceiling(problem, parameter)
    if target > hi_z:
        best_at = high if z_high >= z_low else low
        message = (
            f"The target of ${target:,.2f} is out of reach: changing {phrase} between "
            f"{_format_value(parameter, low)} and {_format_value(parameter, high)} gives at most "
            f"${hi_z:,.2f} (at {_format_value(parameter, best_at)})."
        )
        if ceiling is not None and math.isfinite(ceiling) and target > ceiling + tol:
            message += (
                f" Even with no limit on this input, contribution tops out at ${ceiling:,.2f} because "
                "other resources or demand caps take over, so another input has to change too."
            )
        elif ceiling is not None and (not math.isfinite(ceiling) or target <= ceiling):
            message += " Widen the search range to look further."
        else:
            message += " Widen the search range or change another input as well."
        return result(False, message, ceiling=ceiling)

    worst_at = low if z_low <= z_high else high
    message = (
        f"Contribution stays above ${target:,.2f} across the whole range: the lowest value is "
        f"${lo_z:,.2f} (at {_format_value(parameter, worst_at)}). Widen the search range to find "
        "where it would fall to the target."
    )
    return result(False, message, ceiling=ceiling)
