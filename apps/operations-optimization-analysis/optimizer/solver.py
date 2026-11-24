"""Solve the product-mix LP with scipy.optimize.linprog (HiGHS).

linprog always minimizes, so the profit-maximization problem is passed in as

    minimize  -m . x   subject to  A x <= b,  lb <= x <= ub

and every number that comes back is translated to the maximization view:

* total contribution             Z = -res.fun
* shadow price of resource k     y_k = -res.ineqlin.marginals[k]
  (HiGHS reports d(res.fun)/d(b_k); because res.fun = -Z, dZ/db_k is the
  negative of that. For a "<=" resource the shadow price is >= 0.)
* value of one more unit of a product's demand cap
                                 dZ/d(max_j) = -res.upper.marginals[j]   (>= 0)
* cost of one more unit of a minimum commitment
                                 -dZ/d(min_j) = res.lower.marginals[j]   (>= 0)

tests/test_solver.py checks these conversions against a hand-solved textbook
problem and by re-solving with one extra unit of each resource.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import linprog

from optimizer.model import CONSTRAINT_BY_KEY, CONSTRAINTS, ProductionProblem

STATUS_NAMES: dict[int, str] = {
    0: "optimal",
    1: "iteration_limit",
    2: "infeasible",
    3: "unbounded",
    4: "numerical_error",
}

STATUS_LABELS: dict[str, str] = {
    "optimal": "Optimal plan found",
    "iteration_limit": "Solver stopped at its iteration limit",
    "infeasible": "Infeasible: no plan satisfies every constraint",
    "unbounded": "Unbounded: profit could grow without limit",
    "numerical_error": "Solver ran into numerical difficulties",
    "invalid_input": "Invalid input",
}

# Relative tolerance for calling a constraint "binding" (slack ~ 0) or a
# product "at" one of its bounds. HiGHS works to ~1e-7 feasibility tolerance.
ACTIVE_RTOL = 1e-6
NOISE_ATOL = 1e-9

PLAN_COLUMNS = [
    "product_id",
    "product_name",
    "units",
    "min_units",
    "max_units",
    "unit_margin",
    "contribution",
    "labor_hours_used",
    "machine_hours_used",
    "material_spend",
    "position",
    "reduced_cost",
    "demand_value",
    "commitment_cost",
]

CONSTRAINT_COLUMNS = [
    "key",
    "constraint",
    "unit",
    "used",
    "available",
    "slack",
    "utilization",
    "shadow_price",
    "binding",
]


@dataclass(frozen=True)
class Solution:
    """Result of one solve, already converted to the maximization view."""

    status: str
    status_code: int
    solver_message: str
    objective: float | None
    plan: pd.DataFrame
    constraints: pd.DataFrame
    diagnosis: list[str] = field(default_factory=list)
    integer: bool = False

    @property
    def is_optimal(self) -> bool:
        return self.status == "optimal"

    @property
    def status_label(self) -> str:
        return STATUS_LABELS.get(self.status, self.status)

    def units(self) -> dict[str, float]:
        return dict(zip(self.plan["product_id"], self.plan["units"].astype(float)))

    def binding_keys(self) -> list[str]:
        if self.constraints.empty:
            return []
        return list(self.constraints.loc[self.constraints["binding"].astype(bool), "key"])

    def binding_names(self) -> list[str]:
        if self.constraints.empty:
            return []
        return list(self.constraints.loc[self.constraints["binding"].astype(bool), "constraint"])

    def shadow_prices(self) -> dict[str, float]:
        return dict(zip(self.constraints["key"], self.constraints["shadow_price"].astype(float)))

    def constraint(self, key: str) -> dict:
        rows = self.constraints.loc[self.constraints["key"] == key]
        if rows.empty:
            raise KeyError(key)
        return rows.iloc[0].to_dict()


def _clean(value: float, scale: float = 1.0) -> float:
    """Snap solver noise (e.g. -0.0 or 1e-13) to exactly zero."""
    value = float(value)
    if math.isfinite(value) and abs(value) <= NOISE_ATOL * max(1.0, abs(scale)):
        return 0.0
    return value


def _is_active(gap: float, reference: float) -> bool:
    return abs(gap) <= ACTIVE_RTOL * max(1.0, abs(reference))


def _inputs_are_finite(problem: ProductionProblem) -> bool:
    return bool(
        np.all(np.isfinite(problem.unit_margins()))
        and np.all(np.isfinite(problem.usage_matrix()))
        and np.all(np.isfinite(problem.rhs()))
        and np.all(np.isfinite(problem.lower_bounds()))
    )


def _bounds_conflict(problem: ProductionProblem) -> bool:
    return any(p.max_units is not None and p.max_units < p.min_units for p in problem.products)


def diagnose_infeasible(problem: ProductionProblem) -> list[str]:
    """Explain why no plan can satisfy every constraint.

    Every usage coefficient is validated to be >= 0, so making exactly the
    minimum commitments uses the least of every resource. The model is
    feasible if and only if that minimum plan fits (and no cap is below its
    minimum), so this check is complete rather than a guess.
    """
    messages: list[str] = []
    for product in problem.products:
        if product.max_units is not None and product.max_units < product.min_units:
            messages.append(
                f"{product.product_name}: the demand cap ({product.max_units:,.0f}) is below the "
                f"minimum commitment ({product.min_units:,.0f}). Raise the cap or lower the minimum."
            )
    need = problem.usage_matrix() @ problem.lower_bounds()
    available = problem.rhs()
    for spec, required, have in zip(CONSTRAINTS, need, available):
        if required > have + ACTIVE_RTOL * max(1.0, abs(have)):
            short = required - have
            if spec.unit == "$":
                messages.append(
                    f"The minimum commitments alone need ${required:,.2f} of material, but the budget "
                    f"is ${have:,.2f}. Increase the material budget by at least ${short:,.2f} or "
                    "reduce minimum units."
                )
            else:
                messages.append(
                    f"The minimum commitments alone need {required:,.1f} {spec.name.lower()}, but only "
                    f"{have:,.1f} are available. Add at least {short:,.1f} {spec.name.lower()} or "
                    "reduce minimum units."
                )
    return messages


def diagnose_unbounded(problem: ProductionProblem) -> list[str]:
    messages: list[str] = []
    margins = problem.unit_margins()
    usage = problem.usage_matrix()
    for j, product in enumerate(problem.products):
        if product.max_units is None and margins[j] > 0 and np.all(usage[:, j] == 0):
            messages.append(
                f"{product.product_name} earns ${margins[j]:,.2f} per unit, uses no labor, machine "
                "time or material, and has no demand cap, so the model can make an unlimited "
                "number. Add a demand cap (max_units) or its resource usage."
            )
    return messages


def _failed(status: str, code: int, message: str, diagnosis: list[str], integer: bool) -> Solution:
    return Solution(
        status=status,
        status_code=code,
        solver_message=message,
        objective=None,
        plan=pd.DataFrame(columns=PLAN_COLUMNS),
        constraints=pd.DataFrame(columns=CONSTRAINT_COLUMNS),
        diagnosis=diagnosis,
        integer=integer,
    )


def _run_linprog(problem: ProductionProblem, integer: bool = False, drop_key: str | None = None):
    A = problem.usage_matrix()
    b = problem.rhs()
    if drop_key is not None:
        keep = [i for i, spec in enumerate(CONSTRAINTS) if spec.key != drop_key]
        A, b = A[keep], b[keep]
    kwargs = {}
    if integer:
        kwargs["integrality"] = np.ones(problem.n_products, dtype=int)
    return linprog(
        -problem.unit_margins(),
        A_ub=A,
        b_ub=b,
        bounds=problem.bounds(),
        method="highs",
        **kwargs,
    )


def solve(problem: ProductionProblem, *, integer: bool = False) -> Solution:
    """Solve the LP, or the whole-unit MILP when integer=True.

    A MILP has no meaningful dual values (HiGHS returns zeros), so shadow
    prices and bound values are NaN for integer solves.
    """
    if problem.n_products == 0:
        return _failed("invalid_input", -1, "There are no products to plan.",
                       ["Add at least one product."], integer)
    if not _inputs_are_finite(problem):
        return _failed("invalid_input", -1, "Inputs contain missing or non-finite numbers.",
                       ["Every price, cost, usage and resource value must be a finite number."], integer)
    if _bounds_conflict(problem):
        # linprog raises on lower bound > upper bound; report it as infeasible instead.
        return _failed("infeasible", 2, "A demand cap is below its minimum commitment.",
                       diagnose_infeasible(problem), integer)

    try:
        res = _run_linprog(problem, integer=integer)
    except ValueError as exc:  # malformed input that slipped past validation
        return _failed("invalid_input", -1, str(exc), [str(exc)], integer)

    status = STATUS_NAMES.get(int(res.status), "numerical_error")
    if status != "optimal" or res.x is None:
        diagnosis: list[str]
        if status in ("infeasible", "unbounded"):
            # HiGHS presolve can call a model "unbounded" before it detects that
            # it is infeasible, so run the (exact) feasibility check first.
            infeasible = diagnose_infeasible(problem)
            if infeasible:
                status, diagnosis = "infeasible", infeasible
            elif status == "unbounded":
                diagnosis = diagnose_unbounded(problem) or [
                    "Make sure every profitable product has a demand cap or uses at least one "
                    "limited resource."
                ]
            else:
                diagnosis = ["Check minimum units against the available resources."]
        elif status == "iteration_limit":
            diagnosis = ["The solver stopped before proving optimality. Try simplifying the inputs."]
        else:
            diagnosis = ["Check for extremely large or tiny numbers in the inputs."]
        code = 2 if status == "infeasible" else int(res.status)
        return _failed(status, code, str(res.message), diagnosis, integer)

    A = problem.usage_matrix()
    b = problem.rhs()
    margins = problem.unit_margins()
    x = np.array([_clean(v) for v in res.x])
    objective = _clean(-float(res.fun))

    if integer:
        shadow = np.full(len(CONSTRAINTS), np.nan)
        demand_value = np.full(problem.n_products, np.nan)
        commitment_cost = np.full(problem.n_products, np.nan)
        reduced = np.full(problem.n_products, np.nan)
    else:
        shadow = np.array([_clean(-m) for m in res.ineqlin.marginals])
        demand_value = np.array([_clean(-m) for m in res.upper.marginals])
        commitment_cost = np.array([_clean(m) for m in res.lower.marginals])
        # Reduced cost in the maximization view: m_j - sum_k y_k * a_kj
        reduced = margins - shadow @ A

    used = A @ x
    slack = b - used
    constraint_rows = []
    for k, spec in enumerate(CONSTRAINTS):
        available = float(b[k])
        constraint_rows.append(
            {
                "key": spec.key,
                "constraint": spec.name,
                "unit": spec.unit,
                "used": _clean(used[k], available),
                "available": available,
                "slack": _clean(slack[k], available),
                "utilization": float(used[k] / available) if available > 0 else math.nan,
                "shadow_price": float(shadow[k]),
                "binding": bool(_is_active(slack[k], available)),
            }
        )

    lb = problem.lower_bounds()
    ub = problem.upper_bounds()
    plan_rows = []
    for j, product in enumerate(problem.products):
        units = float(x[j])
        at_max = bool(np.isfinite(ub[j]) and _is_active(ub[j] - units, ub[j]))
        at_min = bool(_is_active(units - lb[j], lb[j]))
        if at_max:
            position = "At demand cap"
        elif at_min and lb[j] > 0:
            position = "At minimum commitment"
        elif at_min:
            position = "Not produced"
        else:
            position = "Between limits"
        plan_rows.append(
            {
                "product_id": product.product_id,
                "product_name": product.product_name,
                "units": units,
                "min_units": float(lb[j]),
                "max_units": float(ub[j]) if np.isfinite(ub[j]) else math.nan,
                "unit_margin": float(margins[j]),
                "contribution": float(margins[j] * units),
                "labor_hours_used": float(A[0, j] * units),
                "machine_hours_used": float(A[1, j] * units),
                "material_spend": float(A[2, j] * units),
                "position": position,
                "reduced_cost": _clean(reduced[j], margins[j]) if not integer else math.nan,
                "demand_value": float(demand_value[j]),
                "commitment_cost": float(commitment_cost[j]),
            }
        )

    return Solution(
        status="optimal",
        status_code=0,
        solver_message=str(res.message),
        objective=objective,
        plan=pd.DataFrame(plan_rows, columns=PLAN_COLUMNS),
        constraints=pd.DataFrame(constraint_rows, columns=CONSTRAINT_COLUMNS),
        diagnosis=[],
        integer=integer,
    )


def objective_value(problem: ProductionProblem) -> float | None:
    """Optimal Z only, or None when there is no optimal solution.

    Skips building result tables; sensitivity analysis and Goal Seek call
    this hundreds of times.
    """
    if problem.n_products == 0 or _bounds_conflict(problem) or not _inputs_are_finite(problem):
        return None
    try:
        res = _run_linprog(problem)
    except ValueError:
        return None
    if res.status != 0 or res.fun is None:
        return None
    return -float(res.fun)


def objective_without_constraint(problem: ProductionProblem, key: str) -> float | None:
    """Optimal Z with one resource constraint removed (math.inf if that makes it unbounded).

    This is the exact ceiling for "how much could more of this resource ever help".
    """
    if key not in CONSTRAINT_BY_KEY:
        raise KeyError(key)
    if problem.n_products == 0 or _bounds_conflict(problem) or not _inputs_are_finite(problem):
        return None
    res = _run_linprog(problem, drop_key=key)
    if res.status == 3:
        return math.inf
    if res.status != 0 or res.fun is None:
        return None
    return -float(res.fun)


def evaluate_plan(problem: ProductionProblem, units: dict[str, float]) -> dict:
    """Contribution and resource use of a given (not necessarily optimal) plan.

    Used to compare an observed production mix with the optimized one using
    the same unit economics.
    """
    x = np.array([float(units.get(pid, 0.0)) for pid in problem.product_ids])
    margins = problem.unit_margins()
    used = problem.usage_matrix() @ x
    available = problem.rhs()
    lb = problem.lower_bounds()
    ub = problem.upper_bounds()
    violations = []
    for k, spec in enumerate(CONSTRAINTS):
        if used[k] > available[k] + ACTIVE_RTOL * max(1.0, available[k]):
            if spec.unit == "$":
                violations.append(f"{spec.name}: needs ${used[k]:,.0f} vs ${available[k]:,.0f} available")
            else:
                violations.append(f"{spec.name}: needs {used[k]:,.1f} vs {available[k]:,.1f} available")
    for j, product in enumerate(problem.products):
        if x[j] < lb[j] - ACTIVE_RTOL * max(1.0, lb[j]):
            violations.append(f"{product.product_name}: below its minimum of {lb[j]:,.0f}")
        if np.isfinite(ub[j]) and x[j] > ub[j] + ACTIVE_RTOL * max(1.0, ub[j]):
            violations.append(f"{product.product_name}: above its demand cap of {ub[j]:,.0f}")
    return {
        "objective": float(margins @ x),
        "used": {spec.key: float(used[k]) for k, spec in enumerate(CONSTRAINTS)},
        "feasible": not violations,
        "violations": violations,
    }
