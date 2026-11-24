"""Plotly figure builders. Pure functions: DataFrame in, Figure out.

They do not import Streamlit, so tests can build every chart and check the
data that went into it.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from optimizer.model import CONSTRAINTS
from ui.theme import CATEGORICAL, GRID, TEXT_MUTED, color_map, style


def _money_axis(fig: go.Figure, axis: str = "y") -> None:
    if axis == "y":
        fig.update_yaxes(tickprefix="$", separatethousands=True)
    else:
        fig.update_xaxes(tickprefix="$", separatethousands=True)


def product_margin_chart(economics: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    """Unit contribution margin by product (from ProductionProblem.products_frame(True))."""
    df = economics.sort_values("unit_margin")
    fig = go.Figure(
        go.Bar(
            x=df["unit_margin"],
            y=df["product_name"],
            orientation="h",
            marker_color=[colors.get(pid, CATEGORICAL[0]) for pid in df["product_id"]],
            customdata=np.stack([df["unit_price"], df["unit_variable_cost"], df["margin_per_labor_hour"]], axis=-1),
            hovertemplate=(
                "<b>%{y}</b><br>Margin %{x:$,.2f}/unit<br>Price %{customdata[0]:$,.2f}"
                "<br>Variable cost %{customdata[1]:$,.2f}<br>Margin per labor hour %{customdata[2]:$,.2f}<extra></extra>"
            ),
        )
    )
    _money_axis(fig, "x")
    return style(fig, title="Unit profit contribution by product", height=320)


def plan_chart(plan: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    """Planned units with the minimum commitment and demand cap shown as markers."""
    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            name="Planned units",
            x=plan["product_name"],
            y=plan["units"],
            marker_color=[colors.get(pid, CATEGORICAL[0]) for pid in plan["product_id"]],
            customdata=np.stack([plan["position"], plan["contribution"]], axis=-1),
            hovertemplate="<b>%{x}</b><br>%{y:,.1f} units<br>%{customdata[0]}<br>Contribution %{customdata[1]:$,.0f}<extra></extra>",
        )
    )
    caps = plan["max_units"]
    fig.add_trace(
        go.Scatter(
            name="Demand cap",
            x=plan["product_name"],
            y=caps,
            mode="markers",
            marker=dict(symbol="line-ew-open", size=26, line=dict(width=2, color=TEXT_MUTED)),
            hovertemplate="<b>%{x}</b><br>Demand cap %{y:,.0f}<extra></extra>",
        )
    )
    fig.add_trace(
        go.Scatter(
            name="Minimum commitment",
            x=plan["product_name"],
            y=plan["min_units"].where(plan["min_units"] > 0),
            mode="markers",
            marker=dict(symbol="triangle-up", size=10, color=TEXT_MUTED),
            hovertemplate="<b>%{x}</b><br>Minimum %{y:,.0f}<extra></extra>",
        )
    )
    fig.update_yaxes(title_text="Units per period")
    return style(fig, title="Recommended production plan", height=380)


def utilization_chart(constraints: pd.DataFrame) -> go.Figure:
    df = constraints.copy()
    df["pct"] = df["utilization"].astype(float) * 100
    labels = [
        "Binding" if b else f"Slack {s:,.0f}" if u != "$" else f"Slack ${s:,.0f}"
        for b, s, u in zip(df["binding"], df["slack"], df["unit"])
    ]
    fig = go.Figure(
        go.Bar(
            x=df["pct"],
            y=df["constraint"],
            orientation="h",
            marker_color=CATEGORICAL[0],
            text=labels,
            textposition="outside",
            cliponaxis=False,
            hovertemplate="<b>%{y}</b><br>%{x:.1f}% used<extra></extra>",
        )
    )
    fig.add_vline(x=100, line_dash="dot", line_color=TEXT_MUTED, line_width=1)
    fig.update_xaxes(range=[0, 125], ticksuffix="%", title_text="Share of available capacity used")
    return style(fig, title="Resource utilization", height=260)


def mix_comparison_chart(comparison: pd.DataFrame) -> go.Figure:
    """comparison: product_name, optimal_units, recent_units."""
    fig = go.Figure()
    fig.add_trace(go.Bar(name="Optimized plan", x=comparison["product_name"], y=comparison["optimal_units"],
                         marker_color=CATEGORICAL[0],
                         hovertemplate="<b>%{x}</b><br>Optimized %{y:,.1f} units<extra></extra>"))
    fig.add_trace(go.Bar(name="Recent average (last 3 months)", x=comparison["product_name"],
                         y=comparison["recent_units"], marker_color=CATEGORICAL[1],
                         hovertemplate="<b>%{x}</b><br>Recent average %{y:,.1f} units<extra></extra>"))
    fig.update_layout(barmode="group")
    fig.update_yaxes(title_text="Units per month")
    return style(fig, title="Optimized mix vs recent production mix", height=360)


def history_trend_chart(monthly: pd.DataFrame) -> go.Figure:
    """monthly: month, revenue, est_contribution (same unit, one axis)."""
    fig = go.Figure()
    fig.add_trace(go.Scatter(name="Revenue", x=monthly["month"], y=monthly["revenue"], mode="lines+markers",
                             line=dict(width=2, color=CATEGORICAL[0]), marker=dict(size=8),
                             hovertemplate="%{x}<br>Revenue %{y:$,.0f}<extra></extra>"))
    fig.add_trace(go.Scatter(name="Estimated contribution", x=monthly["month"], y=monthly["est_contribution"],
                             mode="lines+markers", line=dict(width=2, color=CATEGORICAL[2]), marker=dict(size=8),
                             hovertemplate="%{x}<br>Est. contribution %{y:$,.0f}<extra></extra>"))
    _money_axis(fig)
    fig.update_xaxes(type="category")
    return style(fig, title="Monthly revenue and estimated contribution (synthetic history)", height=340)


def history_labor_chart(monthly: pd.DataFrame, capacity: float) -> go.Figure:
    fig = go.Figure(
        go.Bar(name="Labor hours used", x=monthly["month"], y=monthly["labor_hours_used"],
               marker_color=CATEGORICAL[0],
               hovertemplate="%{x}<br>%{y:,.0f} labor hours<extra></extra>")
    )
    fig.add_hline(y=capacity, line_dash="dot", line_color=TEXT_MUTED, line_width=1,
                  annotation_text=f"Current capacity {capacity:,.0f} h", annotation_position="top left",
                  annotation_font_color=TEXT_MUTED)
    fig.update_xaxes(type="category")
    fig.update_yaxes(title_text="Hours")
    return style(fig, title="Labor hours used vs current capacity (synthetic history)", height=320)


def sweep_objective_chart(sweep: pd.DataFrame, x_label: str, current: float, money_x: bool) -> go.Figure:
    df = sweep.sort_values("value")
    fig = go.Figure(
        go.Scatter(
            name="Optimal contribution",
            x=df["value"],
            y=df["objective"],
            mode="lines+markers",
            line=dict(width=2, color=CATEGORICAL[0]),
            marker=dict(size=8),
            connectgaps=False,
            customdata=df["status"],
            hovertemplate="%{x:,.4g}<br>%{y:$,.0f}<br>%{customdata}<extra></extra>",
        )
    )
    fig.add_vline(x=current, line_dash="dot", line_color=TEXT_MUTED, line_width=1,
                  annotation_text="current", annotation_font_color=TEXT_MUTED)
    infeasible = df.loc[df["status"] != "optimal"]
    if not infeasible.empty:
        fig.add_trace(go.Scatter(name="No optimal plan", x=infeasible["value"],
                                 y=[0] * len(infeasible), mode="markers",
                                 marker=dict(symbol="x", size=9, color=CATEGORICAL[7]),
                                 customdata=infeasible["status"],
                                 hovertemplate="%{x:,.4g}<br>%{customdata}<extra></extra>"))
    _money_axis(fig)
    if money_x:
        _money_axis(fig, "x")
    fig.update_xaxes(title_text=x_label)
    fig.update_yaxes(title_text="Total contribution")
    return style(fig, title="Optimal contribution as the input changes", height=360)


def sweep_units_chart(sweep: pd.DataFrame, products: pd.DataFrame, colors: dict[str, str],
                      x_label: str, money_x: bool) -> go.Figure:
    df = sweep.sort_values("value")
    fig = go.Figure()
    for pid, name in zip(products["product_id"], products["product_name"]):
        column = f"units:{pid}"
        if column not in df:
            continue
        fig.add_trace(go.Scatter(name=name, x=df["value"], y=df[column], mode="lines",
                                 line=dict(width=2, color=colors.get(pid)),
                                 hovertemplate=f"{name}<br>%{{x:,.4g}}: %{{y:,.1f}} units<extra></extra>"))
    if money_x:
        _money_axis(fig, "x")
    fig.update_xaxes(title_text=x_label)
    fig.update_yaxes(title_text="Units in optimal plan")
    return style(fig, title="How the optimal mix shifts", height=380)


def sweep_shadow_chart(sweep: pd.DataFrame, x_label: str, money_x: bool) -> go.Figure:
    """One small panel per resource, because their shadow prices have different units."""
    df = sweep.sort_values("value")
    fig = make_subplots(rows=1, cols=len(CONSTRAINTS), shared_xaxes=True,
                        subplot_titles=[f"{s.name} ({'$ per $' if s.unit == '$' else '$ per hour'})"
                                        for s in CONSTRAINTS])
    for i, spec in enumerate(CONSTRAINTS, start=1):
        column = f"shadow:{spec.key}"
        if column not in df:
            continue
        fig.add_trace(go.Scatter(name=spec.name, x=df["value"], y=df[column], mode="lines+markers",
                                 line=dict(width=2, color=CATEGORICAL[0], shape="linear"), marker=dict(size=6),
                                 showlegend=False,
                                 hovertemplate=f"{spec.name}<br>%{{x:,.4g}}: %{{y:$,.3f}}<extra></extra>"),
                      row=1, col=i)
        if money_x:
            fig.update_xaxes(tickprefix="$", row=1, col=i)
    fig.update_annotations(font_size=12)
    fig.update_xaxes(title_text=x_label, row=1, col=2)
    return style(fig, title="Shadow prices along the sweep", height=300)


def tornado_chart(frame: pd.DataFrame, pct: float) -> go.Figure:
    df = frame.copy()
    fig = go.Figure()
    fig.add_trace(go.Bar(name=f"Input -{pct:g}%", y=df["label"], x=df["change_low"], orientation="h",
                         marker_color=CATEGORICAL[1],
                         hovertemplate="<b>%{y}</b><br>-" + f"{pct:g}" + "%: %{x:$,.0f}<extra></extra>"))
    fig.add_trace(go.Bar(name=f"Input +{pct:g}%", y=df["label"], x=df["change_high"], orientation="h",
                         marker_color=CATEGORICAL[0],
                         hovertemplate="<b>%{y}</b><br>+" + f"{pct:g}" + "%: %{x:$,.0f}<extra></extra>"))
    fig.update_layout(barmode="overlay")
    fig.add_vline(x=0, line_color=GRID, line_width=1)
    _money_axis(fig, "x")
    fig.update_xaxes(title_text="Change in optimal contribution")
    return style(fig, title=f"What moves contribution most (each input changed by {pct:g}% alone)",
                 height=max(320, 28 * len(df) + 120))


def scenario_total_chart(summary: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    fig = go.Figure(
        go.Bar(x=summary["scenario"], y=summary["total_contribution"],
               marker_color=[colors.get(s) for s in summary["scenario"]],
               text=[("n/a" if (v is None or (isinstance(v, float) and math.isnan(v))) else f"${v:,.0f}")
                     for v in summary["total_contribution"]],
               textposition="outside", cliponaxis=False,
               hovertemplate="<b>%{x}</b><br>%{y:$,.0f}<extra></extra>")
    )
    _money_axis(fig)
    return style(fig, title="Total profit contribution by scenario", height=340)


def scenario_units_chart(products: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    fig = go.Figure()
    for scenario, group in products.groupby("scenario", sort=False):
        fig.add_trace(go.Bar(name=scenario, x=group["product_name"], y=group["units"],
                             marker_color=colors.get(scenario),
                             hovertemplate=f"{scenario}<br>%{{x}}: %{{y:,.1f}} units<extra></extra>"))
    fig.update_layout(barmode="group")
    fig.update_yaxes(title_text="Units")
    return style(fig, title="Production plan by scenario", height=380)


def scenario_utilization_chart(constraints: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    df = constraints.copy()
    df["pct"] = 100 * df["used"] / df["available"].replace(0, np.nan)
    fig = go.Figure()
    for scenario, group in df.groupby("scenario", sort=False):
        fig.add_trace(go.Bar(name=scenario, x=group["constraint_name"], y=group["pct"],
                             marker_color=colors.get(scenario),
                             hovertemplate=f"{scenario}<br>%{{x}}: %{{y:.1f}}% used<extra></extra>"))
    fig.add_hline(y=100, line_dash="dot", line_color=TEXT_MUTED, line_width=1)
    fig.update_layout(barmode="group")
    fig.update_yaxes(title_text="% of capacity used", ticksuffix="%")
    return style(fig, title="Resource utilization by scenario", height=340)


def goal_seek_chart(curve: pd.DataFrame, target: float, solution_value: float | None,
                    x_label: str, money_x: bool, current: float) -> go.Figure:
    df = curve.sort_values("value")
    fig = go.Figure(go.Scatter(name="Optimal contribution", x=df["value"], y=df["objective"],
                               mode="lines", line=dict(width=2, color=CATEGORICAL[0]),
                               hovertemplate="%{x:,.4g}<br>%{y:$,.0f}<extra></extra>"))
    fig.add_hline(y=target, line_dash="dash", line_color=CATEGORICAL[1], line_width=1,
                  annotation_text=f"Target ${target:,.0f}", annotation_font_color=TEXT_MUTED,
                  annotation_position="top left")
    fig.add_vline(x=current, line_dash="dot", line_color=TEXT_MUTED, line_width=1,
                  annotation_text="current", annotation_font_color=TEXT_MUTED)
    if solution_value is not None:
        fig.add_trace(go.Scatter(name="Goal Seek result", x=[solution_value], y=[target], mode="markers",
                                 marker=dict(size=12, color=CATEGORICAL[1], line=dict(width=2, color="#151514")),
                                 hovertemplate="%{x:,.4g}<br>%{y:$,.0f}<extra></extra>"))
    _money_axis(fig)
    if money_x:
        _money_axis(fig, "x")
    fig.update_xaxes(title_text=x_label)
    fig.update_yaxes(title_text="Total contribution")
    return style(fig, title="Contribution vs the input being solved for", height=360)


def scenario_colors(names: Sequence[str]) -> dict[str, str]:
    return color_map(list(names))
