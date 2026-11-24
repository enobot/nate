"""Calculations on the (synthetic) production history used by the Dashboard."""

from __future__ import annotations

import pandas as pd

from optimizer.model import ProductionProblem


def history_matches(history: pd.DataFrame, problem: ProductionProblem) -> bool:
    """True when every product in the history exists in the working problem."""
    if history.empty:
        return False
    return set(history["product_id"]).issubset(set(problem.product_ids))


def monthly_summary(history: pd.DataFrame, problem: ProductionProblem) -> pd.DataFrame:
    """Totals per month plus an estimated contribution.

    Estimated contribution = revenue - material spend - other variable cost
    (units x current per-unit value) - labor hours used x labor rate -
    machine hours used x machine rate. It uses actual hours and material
    spend from the history and today's rates, so it is an estimate.
    """
    if history.empty:
        return pd.DataFrame(columns=["month", "units_produced", "revenue", "material_spend",
                                     "labor_hours_used", "machine_hours_used", "est_contribution"])
    other = {p.product_id: p.other_variable_cost for p in problem.products}
    df = history.copy()
    df["other_cost"] = df["units_produced"] * df["product_id"].map(other).fillna(0.0)
    r = problem.resources
    df["est_contribution"] = (
        df["revenue"]
        - df["material_spend"]
        - df["other_cost"]
        - df["labor_hours_used"] * r.labor_rate
        - df["machine_hours_used"] * r.machine_rate
    )
    grouped = (
        df.groupby("month", as_index=False)[
            ["units_produced", "revenue", "material_spend", "labor_hours_used",
             "machine_hours_used", "est_contribution"]
        ]
        .sum()
        .sort_values("month")
        .reset_index(drop=True)
    )
    return grouped


def recent_average_units(history: pd.DataFrame, months: int = 3) -> dict[str, float]:
    """Average monthly units per product over the most recent `months` months."""
    if history.empty:
        return {}
    recent_months = sorted(history["month"].unique())[-months:]
    recent = history.loc[history["month"].isin(recent_months)]
    return recent.groupby("product_id")["units_produced"].mean().astype(float).to_dict()
