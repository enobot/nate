"""Sensitivity: parametric sweeps, shadow-price ranges, and a one-at-a-time tornado chart."""

from __future__ import annotations

import math

import pandas as pd
import streamlit as st

from data.files import frame_to_csv_bytes
from optimizer.model import ProductionProblem
from optimizer.parameters import Parameter, sweepable_parameters
from optimizer.sensitivity import sweep, sweep_values, tornado
from ui import charts, components, state
from ui.theme import color_map


@st.cache_data(show_spinner="Re-solving across the sweep...", max_entries=64)
def cached_sweep(problem_json: str, parameter_key: str, values: tuple[float, ...]) -> pd.DataFrame:
    problem = ProductionProblem.from_json(problem_json)
    return sweep(problem, Parameter.from_key(parameter_key), values)


@st.cache_data(show_spinner="Re-solving for the tornado chart...", max_entries=32)
def cached_tornado(problem_json: str, pct: float) -> pd.DataFrame:
    problem = ProductionProblem.from_json(problem_json)
    params = [Parameter("resource", f) for f in (
        "labor_hours_available", "machine_hours_available", "material_budget",
        "labor_rate", "machine_rate", "material_cost_multiplier")]
    for product in problem.products:
        params.append(Parameter("product", "unit_price", product.product_id))
        if product.max_units is not None:
            params.append(Parameter("product", "max_units", product.product_id))
    return tornado(problem, params, pct)


st.title("Sensitivity analysis")
st.caption(
    "How the optimal plan responds when one input changes. Every point on these charts is a full "
    "re-solve of the model, not an extrapolation."
)
components.data_notice()

problem = state.working_problem()
base = state.solve_problem(problem)
if not base.is_optimal:
    components.solution_status(base)
    st.info("Sensitivity analysis needs an optimal base solution. Fix the inputs on the Optimizer page.")
    st.stop()

colors = color_map(problem.product_ids)
products = problem.products_frame()
tab_sweep, tab_ranges, tab_tornado = st.tabs(["Parametric sweep", "Ranges", "Tornado (what moves profit most)"])

with tab_sweep:
    params = sweepable_parameters(problem)
    labels = {p.key: p.label(problem) for p in params}
    c1, c2, c3 = st.columns([2, 2, 1])
    key = c1.selectbox("Input to vary", list(labels), format_func=labels.get, key="sweep_param")
    low_pct, high_pct = c2.slider("Range (% of current value)", min_value=-100, max_value=300,
                                  value=(-50, 50), step=5, key="sweep_range")
    points = c3.number_input("Points", min_value=5, max_value=101, value=41, step=1, key="sweep_points")
    param = Parameter.from_key(key)
    current = param.current(problem)
    if high_pct <= low_pct:
        st.warning("Pick a range whose high end is above its low end.")
    else:
        values = tuple(float(v) for v in sweep_values(current, low_pct, high_pct, int(points)))
        result = cached_sweep(problem.to_json(), key, values)
        st.plotly_chart(charts.sweep_objective_chart(result, labels[key], current, param.is_money),
                        theme=None, key="sens_obj")
        not_optimal = result.loc[result["status"] != "optimal"]
        if not not_optimal.empty:
            st.info(
                f"{len(not_optimal)} of {len(result)} points have no optimal plan "
                f"({', '.join(sorted(not_optimal['status'].unique()))}); they are marked with an x."
            )
        left, right = st.columns(2)
        with left:
            st.plotly_chart(charts.sweep_units_chart(result, products, colors, labels[key], param.is_money),
                            theme=None, key="sens_units")
        with right:
            st.plotly_chart(charts.sweep_shadow_chart(result, labels[key], param.is_money),
                            theme=None, key="sens_shadow")
        st.caption(
            "Where a line changes slope, the set of binding constraints changed. Shadow prices stay "
            "constant between those breakpoints."
        )
        with st.expander("Sweep data"):
            st.dataframe(result, hide_index=True)
            st.download_button("Download sweep (CSV)", frame_to_csv_bytes(result),
                               file_name="sensitivity_sweep.csv", mime="text/csv")

with tab_ranges:
    rhs, prices = state.ranges_for(problem)
    st.markdown(
        "SciPy's `linprog` returns shadow prices (dual values) but not the *allowable increase / decrease* "
        "ranges that Excel Solver's sensitivity report prints. These ranges are found by re-solving: the "
        "app bisects for the points where the shadow price (or the optimal mix) stops holding. They are "
        "accurate to a small numerical tolerance."
    )
    st.subheader("Resources: where each shadow price holds")
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Resource": x.name,
                    "Current": x.current,
                    "Shadow price": x.shadow_price,
                    "Valid from": x.lower,
                    "Valid up to": None if math.isinf(x.upper) else x.upper,
                    "Allowable decrease": x.allowable_decrease,
                    "Allowable increase": None if math.isinf(x.upper) else x.allowable_increase,
                    "Past the upper end": x.next_limit or ("no limit found" if math.isinf(x.upper) else ""),
                }
                for x in rhs
            ]
        ),
        hide_index=True,
        column_config={
            "Current": st.column_config.NumberColumn(format="localized"),
            "Shadow price": st.column_config.NumberColumn(format="%.4f"),
            "Valid from": st.column_config.NumberColumn(format="localized"),
            "Valid up to": st.column_config.NumberColumn(format="localized", help="Empty means no upper limit."),
            "Allowable decrease": st.column_config.NumberColumn(format="localized"),
            "Allowable increase": st.column_config.NumberColumn(format="localized", help="Empty means unlimited."),
        },
    )
    st.subheader("Products: price range that keeps the current mix optimal")
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Product": x.product_name,
                    "Units in plan": x.units,
                    "Current price": x.current_price,
                    "Lowest price": x.lower_price,
                    "Highest price": None if math.isinf(x.upper_price) else x.upper_price,
                }
                for x in prices
            ]
        ),
        hide_index=True,
        column_config={
            "Units in plan": st.column_config.NumberColumn(format="%.2f"),
            "Current price": st.column_config.NumberColumn(format="dollar"),
            "Lowest price": st.column_config.NumberColumn(format="dollar"),
            "Highest price": st.column_config.NumberColumn(format="dollar", help="Empty means no upper limit."),
        },
    )
    st.caption(
        "Within a product's price range the same production quantities stay optimal (total contribution "
        "still changes, by units x price change). A product already at its demand cap has no upper limit; "
        "one at its minimum has no lower limit above $0."
    )

with tab_tornado:
    pct = st.slider("Change each input by (%)", min_value=1, max_value=50, value=10, step=1, key="tornado_pct")
    frame = cached_tornado(problem.to_json(), float(pct))
    if frame.empty:
        st.info("No inputs with non-zero values to vary.")
    else:
        st.plotly_chart(charts.tornado_chart(frame, float(pct)), theme=None, key="sens_tornado")
        st.caption(
            f"Each bar is one re-solve with a single input moved {pct}% down or up while everything else "
            f"stays at today's values (base contribution {components.money(base.objective)}). Inputs at the "
            "top move contribution the most."
        )
        with st.expander("Tornado data"):
            st.dataframe(frame.drop(columns=["key"]), hide_index=True)
