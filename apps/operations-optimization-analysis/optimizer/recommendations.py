"""Plain-English recommendations built from solver output.

Every sentence is built from numbers in the Solution (plan, slack, shadow
prices, reduced costs) and, when available, the ranges from
optimizer.sensitivity. Nothing here is a canned statement: if a number is not
available (for example, ranges were not computed), the sentence that needs
it is left out.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

from optimizer.model import CONSTRAINT_BY_KEY, ProductionProblem
from optimizer.sensitivity import PriceRange, RhsRange
from optimizer.solver import Solution

ZERO = 1e-7


@dataclass(frozen=True)
class Recommendation:
    kind: str  # summary | bottleneck | capacity | slack | demand | commitment | not_produced | pricing | whole_units | problem
    text: str


def money(value: float, decimals: int = 2) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.{decimals}f}"


def units_text(value: float) -> str:
    if abs(value - round(value)) < 1e-6:
        return f"{int(round(value)):,}"
    return f"{value:,.1f}"


def amount_text(value: float, unit: str, decimals: int = 1) -> str:
    if unit == "$":
        return money(value, 0)
    return f"{value:,.{decimals}f} {unit}"


def _summary(solution: Solution) -> Recommendation:
    produced = solution.plan.loc[solution.plan["units"] > ZERO]
    if produced.empty:
        mix = "the plan makes nothing"
    else:
        parts = [f"{units_text(r.units)} units of {r.product_name}" for r in produced.itertuples(index=False)]
        mix = "make " + ", ".join(parts)
    kind = "whole-unit" if solution.integer else "recommended"
    return Recommendation(
        "summary",
        f"The {kind} plan earns {money(solution.objective, 0)} in profit contribution for the period: {mix}.",
    )


def _constraint_text(problem: ProductionProblem, row: dict, rng: RhsRange | None) -> Recommendation:
    spec = CONSTRAINT_BY_KEY[row["key"]]
    y = float(row["shadow_price"])
    used, available, slack = float(row["used"]), float(row["available"]), float(row["slack"])
    is_money = spec.unit == "$"

    if not row["binding"]:
        pct = f" ({used / available:.0%})" if available > 0 else ""
        if is_money:
            text = (
                f"{spec.name} is not a constraint right now: {money(used, 0)} of {money(available, 0)} is "
                f"spent{pct}, leaving {money(slack, 0)} unused. A bigger budget would not raise "
                f"contribution, and it could be cut by up to {money(slack, 0)} without changing the plan."
            )
        else:
            text = (
                f"{spec.name} is not a constraint right now: {used:,.1f} of {available:,.1f} {spec.unit} are "
                f"used{pct}, leaving {slack:,.1f} {spec.unit} idle. More would not raise contribution, and up "
                f"to {slack:,.1f} {spec.unit} could be cut without changing the plan."
            )
        return Recommendation("slack", text)

    if y <= ZERO:
        return Recommendation(
            "capacity",
            f"{spec.name} is fully used, but its shadow price is $0: adding more would not raise "
            "contribution, because another limit is reached at the same point.",
        )

    if is_money:
        head = (
            f"{spec.name} is a bottleneck: all {money(available, 0)} is spent. Each extra $1,000 of "
            f"budget would add about {money(1000 * y, 0)} of contribution (shadow price {money(y, 3)} per "
            "dollar), after paying for the material itself."
        )
    else:
        head = (
            f"{spec.name} is a bottleneck: all {available:,.1f} {spec.unit} are used. Each additional hour "
            f"would add about {money(y)} of contribution (its shadow price)."
        )
    parts = [head]
    if rng is not None:
        if math.isinf(rng.upper):
            parts.append("That value held for every increase tested.")
        else:
            gain = rng.upper - rng.current
            parts.append(
                f"That value holds up to {amount_text(rng.upper, spec.unit)} "
                f"(+{amount_text(gain, spec.unit)})"
                + (f"; beyond that, {rng.next_limit}." if rng.next_limit else ".")
            )
        if rng.lower < rng.current - ZERO:
            parts.append(
                f"Cutting it would cost the same {money(y, 3 if is_money else 2)} per "
                f"{'dollar' if is_money else 'hour'} down to about {amount_text(rng.lower, spec.unit)}."
            )
    rate_field = {"labor": "labor_rate", "machine": "machine_rate"}.get(spec.key)
    if rate_field:
        rate = getattr(problem.resources, rate_field)
        parts.append(
            f"The {money(rate)}/hour rate is already counted in product costs, so an extra hour is worth "
            f"paying up to about {money(rate + y)}/hour for (for example, overtime or a rental)."
        )
    return Recommendation("bottleneck", " ".join(parts))


def recommendations(
    problem: ProductionProblem,
    solution: Solution,
    rhs: Sequence[RhsRange] | None = None,
    prices: Sequence[PriceRange] | None = None,
    integer_solution: Solution | None = None,
) -> list[Recommendation]:
    if not solution.is_optimal:
        items = [Recommendation("problem", f"{solution.status_label}.")]
        items += [Recommendation("problem", d) for d in solution.diagnosis]
        return items

    items: list[Recommendation] = [_summary(solution)]

    if not solution.integer:
        ranges = {r.key: r for r in (rhs or [])}
        for row in solution.constraints.to_dict(orient="records"):
            items.append(_constraint_text(problem, row, ranges.get(row["key"])))

        for row in solution.plan.itertuples(index=False):
            if row.unit_margin <= 0:
                items.append(
                    Recommendation(
                        "not_produced",
                        f"{row.product_name} loses {money(-row.unit_margin)} per unit at current costs, "
                        "so the plan makes only its minimum commitment.",
                    )
                )
                continue
            if row.position == "At demand cap" and row.demand_value > ZERO:
                items.append(
                    Recommendation(
                        "demand",
                        f"{row.product_name} is at its demand cap of {units_text(row.max_units)} units. If the "
                        f"market would take more, each extra unit would add about {money(row.demand_value)} "
                        "(its margin minus the value of the labor and material it takes from other products).",
                    )
                )
            elif row.position == "At minimum commitment" and row.commitment_cost > ZERO:
                items.append(
                    Recommendation(
                        "commitment",
                        f"The minimum commitment of {units_text(row.min_units)} units of {row.product_name} "
                        f"lowers contribution by about {money(row.commitment_cost)} per committed unit compared "
                        "with using those resources on other products. Worth reviewing if it is negotiable.",
                    )
                )
            elif row.position == "Not produced" and row.reduced_cost < -ZERO:
                gap = -row.reduced_cost
                price = problem.product(row.product_id).unit_price
                items.append(
                    Recommendation(
                        "not_produced",
                        f"{row.product_name} is not in the plan. Its {money(row.unit_margin)} margin per unit "
                        "is less than the value of the resources it would use; its price would have to rise by "
                        f"about {money(gap)} (to about {money(price + gap)}) before making it pays off.",
                    )
                )

        for pr in prices or []:
            row = solution.plan.loc[solution.plan["product_id"] == pr.product_id].iloc[0]
            if row["position"] != "Between limits":
                continue
            upper = "no upper limit found" if math.isinf(pr.upper_price) else money(pr.upper_price)
            items.append(
                Recommendation(
                    "pricing",
                    f"The recommended mix stays the same while the {pr.product_name} price is between "
                    f"{money(pr.lower_price)} and {upper} (now {money(pr.current_price)}). Outside that range "
                    "the solver switches to a different mix.",
                )
            )

    if integer_solution is not None and integer_solution.is_optimal and not solution.integer:
        fractional = solution.plan.loc[(solution.plan["units"] - solution.plan["units"].round()).abs() > 1e-6]
        if not fractional.empty:
            gap = solution.objective - integer_solution.objective
            pct = gap / solution.objective if solution.objective else 0.0
            items.append(
                Recommendation(
                    "whole_units",
                    "The LP plan includes fractional units. Re-solving with whole units only (an integer "
                    f"program) earns {money(integer_solution.objective, 0)}, which is {money(gap, 0)} "
                    f"({pct:.2%}) below the LP value.",
                )
            )
    return items
