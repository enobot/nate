"""Dashboard: today's optimal plan at a glance plus the synthetic production history."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from data import database as db
from data.analytics import history_matches, monthly_summary, recent_average_units
from optimizer.solver import evaluate_plan
from ui import charts, components, state
from ui.theme import color_map

st.title("Operations & Optimization Analysis")
st.caption(
    "Product-mix optimization for a fictional furniture maker: how many of each product to build "
    "with limited labor hours, machine hours and material budget. An expanded portfolio rebuild of "
    "an Excel linear programming coursework project."
)
components.data_notice()

problem = state.working_problem()
solution = state.solve_problem(problem)
colors = color_map(problem.product_ids)

if not solution.is_optimal:
    components.solution_status(solution)
    st.page_link("app_pages/optimizer.py", label="Open the Optimizer to fix the inputs", icon=":material/tune:")
    st.stop()

history = db.load_history(state.db_path())
has_history = history_matches(history, problem)
recent = recent_average_units(history) if has_history else {}
recent_eval = evaluate_plan(problem, recent) if has_history else None

c1, c2, c3, c4 = st.columns(4)
c1.metric("Optimal profit contribution", components.money(solution.objective),
          help="Total of (price - variable cost) x units for the optimal plan, per planning period (month).",
          border=True)
if recent_eval is not None:
    gain = solution.objective - recent_eval["objective"]
    c2.metric(
        "Gain vs recent mix",
        components.money(gain),
        delta=f"{gain / recent_eval['objective']:+.1%}" if recent_eval["objective"] else None,
        help="Optimal contribution minus the contribution of the last 3 months' average mix, "
             "both valued at today's prices and standard costs.",
        border=True,
    )
else:
    c2.metric("Gain vs recent mix", "n/a", help="Needs production history for these product IDs.", border=True)
binding = solution.binding_names()
c3.metric("Binding constraints", ", ".join(binding) if binding else "None",
          help="Resources that are fully used in the optimal plan.", border=True)
c4.metric("Units planned", f"{solution.plan['units'].sum():,.1f}", border=True)

left, right = st.columns([3, 2])
with left:
    st.plotly_chart(charts.plan_chart(solution.plan, colors), theme=None, key="dash_plan")
with right:
    st.plotly_chart(charts.utilization_chart(solution.constraints), theme=None, key="dash_util")
    st.plotly_chart(
        charts.product_margin_chart(problem.products_frame(include_economics=True), colors),
        theme=None, key="dash_margin",
    )

st.subheader("Production history")
if not has_history:
    st.info(
        "The bundled 12-month history belongs to the synthetic sample company, and its product IDs "
        "don't match the working data, so the history charts and the comparison are hidden."
    )
else:
    st.caption(
        "Synthetic history built from a fixed random seed (see data/sample_data.py). "
        "Estimated contribution uses actual hours and material spend with today's rates."
    )
    comparison = pd.DataFrame(
        {
            "product_name": solution.plan["product_name"],
            "optimal_units": solution.plan["units"],
            "recent_units": [recent.get(pid, 0.0) for pid in solution.plan["product_id"]],
        }
    )
    st.plotly_chart(charts.mix_comparison_chart(comparison), theme=None, key="dash_mix")
    if recent_eval and not recent_eval["feasible"]:
        st.warning(
            "The recent average mix would not fit today's limits: "
            + "; ".join(recent_eval["violations"])
        )
    elif recent_eval:
        st.caption(
            f"The recent average mix is worth {components.money(recent_eval['objective'])} at today's "
            "prices and standard costs and fits within today's limits."
        )
    monthly = monthly_summary(history, problem)
    h1, h2 = st.columns(2)
    with h1:
        st.plotly_chart(charts.history_trend_chart(monthly), theme=None, key="dash_trend")
    with h2:
        st.plotly_chart(
            charts.history_labor_chart(monthly, problem.resources.labor_hours_available),
            theme=None, key="dash_labor",
        )
    with st.expander("Monthly history table"):
        st.dataframe(monthly, hide_index=True)

st.divider()
n1, n2, n3 = st.columns(3)
n1.page_link("app_pages/optimizer.py", label="Change inputs and see recommendations", icon=":material/tune:")
n2.page_link("app_pages/sensitivity.py", label="Sensitivity and what-if sweeps", icon=":material/ssid_chart:")
n3.page_link("app_pages/goal_seek.py", label="Goal Seek a target profit", icon=":material/flag:")
