"""Sensitivity analysis built from repeated solves.

scipy's linprog returns dual values (shadow prices) but not the ranging
report Excel Solver prints ("allowable increase / decrease"). This module
recovers that information directly:

* rhs_ranges: for each resource, the interval of availability over which its
  shadow price stays valid. Optimal contribution Z(b) is a concave,
  piecewise-linear function of a right-hand side b, so the set of b where
  Z(b) = Z(b0) + y * (b - b0) is an interval; its ends are found by bisection.
* price_ranges: for each product, the interval of unit price over which the
  current production plan stays optimal. The test "the old plan is still
  optimal" is Z(p) = Z(p0) + (p - p0) * x_j, which also defines an interval.
* sweep: re-solve on a grid of values for any single input (for charts).
* tornado: contribution at -pct / +pct for many inputs (one chart).

Results are accurate to the bisection tolerance, not exact like a simplex
ranging report. The tests compare them against hand-worked textbook values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Iterable, Sequence

import numpy as np
import pandas as pd

from optimizer.model import CONSTRAINTS, ProductionProblem
from optimizer.parameters import Parameter
from optimizer.solver import Solution, objective_value, solve

SEARCH_FACTOR = 100.0  # search up to 100x the current value for range ends
Z_RTOL = 1e-7  # relative tolerance when comparing objective values
X_RTOL = 1e-6  # bisection stops when the interval is this small (relative)


def _z_tolerance(*values: float) -> float:
    return Z_RTOL * max(1.0, *(abs(v) for v in values))


def _search_up(pred: Callable[[float], bool], start: float, limit: float, tol: float) -> tuple[float, bool]:
    """Largest v in [start, limit] with pred(v) True, given pred(start) is True
    and pred is True on an interval. Returns (value, hit_limit)."""
    if pred(limit):
        return limit, True
    good, bad = start, limit
    while bad - good > tol:
        mid = 0.5 * (good + bad)
        if pred(mid):
            good = mid
        else:
            bad = mid
    return good, False


def _search_down(pred: Callable[[float], bool], start: float, floor: float, tol: float) -> tuple[float, bool]:
    """Smallest v in [floor, start] with pred(v) True, given pred(start) is True."""
    if pred(floor):
        return floor, True
    good, bad = start, floor
    while good - bad > tol:
        mid = 0.5 * (good + bad)
        if pred(mid):
            good = mid
        else:
            bad = mid
    return good, False


@dataclass(frozen=True)
class RhsRange:
    key: str
    name: str
    unit: str
    current: float
    shadow_price: float
    lower: float
    upper: float  # math.inf when the shadow price holds for any increase
    upper_hit_search_limit: bool
    next_limit: str | None  # what changes just past `upper`

    @property
    def allowable_increase(self) -> float:
        return self.upper - self.current

    @property
    def allowable_decrease(self) -> float:
        return self.current - self.lower


def _describe_change(base: Solution, after: Solution, skip_key: str) -> str | None:
    """Plain-English description of what became limiting between two solutions."""
    if not after.is_optimal:
        return None
    notes: list[str] = []
    base_binding = set(base.binding_keys())
    names = {spec.key: spec.name for spec in CONSTRAINTS}
    for key in after.binding_keys():
        if key not in base_binding and key != skip_key:
            notes.append(f"{names[key]} also becomes fully used")
    if skip_key in base_binding and skip_key not in after.binding_keys():
        notes.append(f"{names[skip_key]} stops being a limit")
    base_pos = dict(zip(base.plan["product_id"], base.plan["position"]))
    for _, row in after.plan.iterrows():
        before = base_pos.get(row["product_id"])
        if row["position"] != before and row["position"] in ("At demand cap", "Not produced", "At minimum commitment"):
            if row["position"] == "At demand cap":
                notes.append(f"{row['product_name']} reaches its demand cap")
            elif row["position"] == "Not produced":
                notes.append(f"{row['product_name']} drops out of the plan")
            else:
                notes.append(f"{row['product_name']} falls to its minimum commitment")
    return "; ".join(notes) if notes else None


def rhs_ranges(problem: ProductionProblem, solution: Solution | None = None) -> list[RhsRange]:
    """Valid range of each resource's shadow price (see module docstring)."""
    base = solution if solution is not None else solve(problem)
    if not base.is_optimal or base.integer:
        return []
    z0 = float(base.objective)
    results: list[RhsRange] = []
    for spec, row in zip(CONSTRAINTS, base.constraints.itertuples(index=False)):
        b0 = float(row.available)
        y = float(row.shadow_price)
        tol_b = X_RTOL * max(1.0, abs(b0))

        def holds(b: float, _field=spec.resource_field, _b0=b0, _y=y) -> bool:
            z = objective_value(problem.with_resource(_field, b))
            if z is None:
                return False
            expected = z0 + _y * (b - _b0)
            return abs(z - expected) <= _z_tolerance(z0, expected)

        if y <= 0:
            # A zero shadow price means extra capacity is never used (Z stays flat).
            upper, hit = math.inf, False
            if not row.binding:
                lower = b0 - float(row.slack)
            else:
                lower, _ = _search_down(holds, b0, 0.0, tol_b)
        else:
            limit = b0 + SEARCH_FACTOR * max(1.0, abs(b0))
            upper, hit = _search_up(holds, b0, limit, tol_b)
            if hit:
                upper = math.inf
            lower, _ = _search_down(holds, b0, 0.0, tol_b)

        next_limit = None
        if math.isfinite(upper):
            delta = max(1e-4 * max(1.0, abs(upper)), 10 * tol_b)
            after = solve(problem.with_resource(spec.resource_field, upper + delta))
            next_limit = _describe_change(base, after, spec.key)
        results.append(
            RhsRange(
                key=spec.key,
                name=spec.name,
                unit=spec.unit,
                current=b0,
                shadow_price=y,
                lower=max(0.0, lower),
                upper=upper,
                upper_hit_search_limit=hit,
                next_limit=next_limit,
            )
        )
    return results


@dataclass(frozen=True)
class PriceRange:
    product_id: str
    product_name: str
    units: float
    current_price: float
    lower_price: float
    upper_price: float  # math.inf when no increase changes the plan
    upper_hit_search_limit: bool


def price_ranges(problem: ProductionProblem, solution: Solution | None = None) -> list[PriceRange]:
    """Unit-price interval for each product over which the current plan stays optimal."""
    base = solution if solution is not None else solve(problem)
    if not base.is_optimal or base.integer:
        return []
    z0 = float(base.objective)
    results: list[PriceRange] = []
    for row in base.plan.itertuples(index=False):
        pid = row.product_id
        p0 = problem.product(pid).unit_price
        x0 = float(row.units)
        tol_p = X_RTOL * max(1.0, abs(p0))

        def holds(price: float, _pid=pid, _p0=p0, _x0=x0) -> bool:
            z = objective_value(problem.with_product_value(_pid, "unit_price", price))
            if z is None:
                return False
            expected = z0 + (price - _p0) * _x0
            return abs(z - expected) <= _z_tolerance(z0, expected)

        # Shortcuts that are exact: a product already at its cap can only become
        # more attractive as its price rises, and one at its minimum only less
        # attractive as its price falls, so the plan cannot change in those directions.
        if row.position == "At demand cap":
            upper, hit = math.inf, False
        else:
            limit = p0 + SEARCH_FACTOR * max(1.0, abs(p0))
            upper, hit = _search_up(holds, p0, limit, tol_p)
            if hit:
                upper = math.inf
        if row.position in ("Not produced", "At minimum commitment"):
            lower = 0.0
        else:
            lower, _ = _search_down(holds, p0, 0.0, tol_p)
        results.append(
            PriceRange(
                product_id=pid,
                product_name=row.product_name,
                units=x0,
                current_price=p0,
                lower_price=lower,
                upper_price=upper,
                upper_hit_search_limit=hit,
            )
        )
    return results


def sweep(problem: ProductionProblem, parameter: Parameter, values: Iterable[float]) -> pd.DataFrame:
    """Re-solve the model for each value of one input.

    Returns one row per value with the status, total contribution, units of
    each product, and the shadow price and slack of each resource.
    """
    rows = []
    for value in values:
        value = float(value)
        record: dict[str, object] = {"value": value}
        try:
            sol = solve(parameter.apply(problem, value))
        except ValueError as exc:  # e.g. negative value
            record.update({"status": "invalid", "objective": math.nan, "note": str(exc)})
            rows.append(record)
            continue
        record["status"] = sol.status
        record["objective"] = sol.objective if sol.is_optimal else math.nan
        if sol.is_optimal:
            for prow in sol.plan.itertuples(index=False):
                record[f"units:{prow.product_id}"] = prow.units
            for crow in sol.constraints.itertuples(index=False):
                record[f"shadow:{crow.key}"] = crow.shadow_price
                record[f"slack:{crow.key}"] = crow.slack
                record[f"used:{crow.key}"] = crow.used
        rows.append(record)
    return pd.DataFrame(rows)


def sweep_values(current: float, low_pct: float, high_pct: float, points: int) -> np.ndarray:
    """Evenly spaced values from current*(1+low_pct/100) to current*(1+high_pct/100), clipped at 0."""
    if points < 2:
        raise ValueError("A sweep needs at least 2 points")
    if high_pct <= low_pct:
        raise ValueError("The high end of the sweep must be above the low end")
    lo = max(0.0, current * (1 + low_pct / 100.0))
    hi = max(0.0, current * (1 + high_pct / 100.0))
    values = np.linspace(lo, hi, points)
    # Always include the current value so the chart can mark today's position.
    if current not in values and lo <= current <= hi:
        values = np.sort(np.append(values, current))
    return values


def tornado(problem: ProductionProblem, parameters: Sequence[Parameter], pct: float = 10.0) -> pd.DataFrame:
    """Contribution when each input moves down and up by pct percent (one at a time)."""
    base = objective_value(problem)
    rows = []
    for param in parameters:
        current = param.current(problem)
        if current is None or current == 0:
            continue
        low = current * (1 - pct / 100.0)
        high = current * (1 + pct / 100.0)
        z_low = objective_value(param.apply(problem, max(0.0, low)))
        z_high = objective_value(param.apply(problem, high))
        rows.append(
            {
                "key": param.key,
                "label": param.label(problem),
                "low_value": low,
                "high_value": high,
                "objective_low": z_low,
                "objective_high": z_high,
                "change_low": None if (z_low is None or base is None) else z_low - base,
                "change_high": None if (z_high is None or base is None) else z_high - base,
            }
        )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame["swing"] = (
        frame[["change_low", "change_high"]].astype(float).abs().max(axis=1, skipna=True)
    )
    return frame.sort_values("swing", ascending=True, kind="stable").reset_index(drop=True)
