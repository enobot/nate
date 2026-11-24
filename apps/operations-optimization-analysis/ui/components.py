"""Small Streamlit helpers shared by the pages."""

from __future__ import annotations

import math
from typing import Sequence

import pandas as pd
import streamlit as st

from data.sample_data import SYNTHETIC_NOTICE
from optimizer.recommendations import Recommendation
from optimizer.solver import Solution
from ui import state

_MD_SPECIAL = "\\`*_[]<>#|~$"

KIND_LABELS = {
    "summary": "Plan",
    "bottleneck": "Bottleneck",
    "capacity": "Fully used",
    "slack": "Spare capacity",
    "demand": "Demand cap",
    "commitment": "Commitment",
    "not_produced": "Not produced",
    "pricing": "Price range",
    "whole_units": "Whole units",
    "problem": "Problem",
}


def escape_md(text: str) -> str:
    """Escape characters Streamlit Markdown would interpret ($ starts LaTeX, etc.)."""
    return "".join("\\" + ch if ch in _MD_SPECIAL else ch for ch in str(text))


def money(value: float | None, decimals: int = 0) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.{decimals}f}"


def data_notice() -> None:
    """Show which data is loaded and whether it is synthetic."""
    w = state.working()
    if w["is_synthetic"]:
        st.badge("Synthetic data", color="orange")
        st.caption(escape_md(SYNTHETIC_NOTICE))
    else:
        st.badge("User-provided data", color="blue")
        st.caption(f"Working data: {escape_md(w['label'])}")


def sidebar_status() -> None:
    w = state.working()
    with st.sidebar:
        st.markdown("**Working data**")
        st.caption(escape_md(w["label"]) + ("  \n(edited in this session)" if w["edited"] else ""))
        if w["is_synthetic"]:
            st.badge("Synthetic data", color="orange")
        st.caption(
            "Expanded portfolio rebuild of an Excel coursework project. See About & Method."
        )


def recommendations_list(items: Sequence[Recommendation]) -> None:
    lines = [f"- **{KIND_LABELS.get(r.kind, r.kind)}:** {escape_md(r.text)}" for r in items]
    st.markdown("\n".join(lines))


def solution_status(solution: Solution) -> None:
    if solution.is_optimal:
        st.success(f"{solution.status_label}. Solver: HiGHS via scipy.optimize.linprog.")
        return
    st.error(solution.status_label)
    for note in solution.diagnosis:
        st.markdown(f"- {escape_md(note)}")
    st.caption(f"Solver message: {escape_md(solution.solver_message)}")


def plan_table(plan: pd.DataFrame) -> None:
    st.dataframe(
        plan[["product_id", "product_name", "units", "min_units", "max_units", "unit_margin",
              "contribution", "position", "reduced_cost", "demand_value", "commitment_cost"]],
        hide_index=True,
        column_config={
            "product_id": st.column_config.TextColumn("ID"),
            "product_name": st.column_config.TextColumn("Product"),
            "units": st.column_config.NumberColumn("Units", format="%.2f"),
            "min_units": st.column_config.NumberColumn("Min", format="%.0f"),
            "max_units": st.column_config.NumberColumn("Cap", format="%.0f"),
            "unit_margin": st.column_config.NumberColumn("Margin/unit", format="dollar"),
            "contribution": st.column_config.NumberColumn("Contribution", format="dollar"),
            "position": st.column_config.TextColumn("Position"),
            "reduced_cost": st.column_config.NumberColumn(
                "Reduced cost", format="%.4f",
                help="Unit margin minus the shadow-price value of the resources one unit uses.",
            ),
            "demand_value": st.column_config.NumberColumn(
                "Value of +1 demand", format="dollar",
                help="Change in total contribution if this product's demand cap rose by one unit.",
            ),
            "commitment_cost": st.column_config.NumberColumn(
                "Cost of +1 minimum", format="dollar",
                help="Drop in total contribution if the minimum commitment rose by one unit.",
            ),
        },
    )


def constraints_table(constraints: pd.DataFrame, extra: pd.DataFrame | None = None) -> None:
    df = constraints.copy()
    if extra is not None and not extra.empty:
        df = df.merge(extra, on="key", how="left")
    columns = ["constraint", "used", "available", "slack", "utilization", "binding", "shadow_price"]
    columns += [c for c in ("resolve_delta", "range_low", "range_high", "next_limit") if c in df]
    st.dataframe(
        df[columns],
        hide_index=True,
        column_config={
            "constraint": st.column_config.TextColumn("Resource"),
            "used": st.column_config.NumberColumn("Used", format="localized"),
            "available": st.column_config.NumberColumn("Available", format="localized"),
            "slack": st.column_config.NumberColumn("Slack", format="localized"),
            "utilization": st.column_config.ProgressColumn("Utilization", format="percent", min_value=0, max_value=1),
            "binding": st.column_config.CheckboxColumn("Binding"),
            "shadow_price": st.column_config.NumberColumn(
                "Shadow price", format="%.4f",
                help="Extra contribution from one more unit of this resource (from the HiGHS dual values).",
            ),
            "resolve_delta": st.column_config.NumberColumn(
                "Check: re-solve +1", format="%.4f",
                help="Actual change in contribution when the model is re-solved with one more unit.",
            ),
            "range_low": st.column_config.NumberColumn("Shadow price valid from", format="localized"),
            "range_high": st.column_config.NumberColumn("...up to", format="localized"),
            "next_limit": st.column_config.TextColumn("What changes past the upper end"),
        },
    )
