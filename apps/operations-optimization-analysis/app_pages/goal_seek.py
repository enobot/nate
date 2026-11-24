"""Goal Seek: what value of one input reaches a target profit contribution?"""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from optimizer.goal_seek import default_search_range, goal_seek
from optimizer.model import ProductionProblem
from optimizer.parameters import Parameter, goal_seek_parameters
from optimizer.sensitivity import sweep
from ui import charts, components, state


@st.cache_data(show_spinner=False, max_entries=64)
def cached_curve(problem_json: str, parameter_key: str, low: float, high: float) -> pd.DataFrame:
    problem = ProductionProblem.from_json(problem_json)
    values = np.linspace(low, high, 61)
    return sweep(problem, Parameter.from_key(parameter_key), values)


st.title("Goal Seek")
st.caption(
    "Like Excel's Goal Seek, but the formula is the whole optimization: the app re-solves the LP for "
    "candidate values of one input and uses SciPy's brentq root finder to hit the target contribution."
)
components.data_notice()

problem = state.working_problem()
base = state.solve_problem(problem)
if not base.is_optimal:
    components.solution_status(base)
    st.info("Goal Seek needs an optimal starting plan. Fix the inputs on the Optimizer page.")
    st.stop()

params = goal_seek_parameters(problem)
labels = {p.key: p.label(problem) for p in params}

c1, c2 = st.columns([2, 1])
key = c1.selectbox("Input to change", list(labels), format_func=labels.get, key="gs_param")
param = Parameter.from_key(key)
default_target = float(round(base.objective * 1.05, -2))
target = c2.number_input("Target profit contribution ($)", min_value=0.0, max_value=1e10,
                         value=default_target, step=1000.0, key="gs_target")
current = param.current(problem)
st.caption(f"Current value: {components.escape_md(f'{current:,.4g}')} {param.unit} - "
           f"current contribution: {components.escape_md(components.money(base.objective))}")

low_default, high_default = default_search_range(param, problem)
with st.expander("Search range"):
    r1, r2 = st.columns(2)
    low = r1.number_input("Lowest value to try", min_value=0.0, max_value=1e10, value=float(low_default),
                          key=f"gs_low_{key}")
    high = r2.number_input("Highest value to try", min_value=0.0, max_value=1e10, value=float(high_default),
                           key=f"gs_high_{key}")

if st.button("Run Goal Seek", type="primary", icon=":material/flag:"):
    try:
        st.session_state["gs_result"] = (key, problem.to_json(), goal_seek(problem, param, target, low=low, high=high))
    except ValueError as exc:
        st.session_state.pop("gs_result", None)
        st.error(str(exc))

stored = st.session_state.get("gs_result")
if stored and stored[0] == key and stored[1] == problem.to_json():
    result = stored[2]
    if result.found:
        st.success(result.message)
        m1, m2, m3 = st.columns(3)
        m1.metric("Required value", f"{result.value:,.4f} {param.unit}",
                  delta=None if result.change_pct is None else f"{result.change_pct:+.2f}%", delta_color="off",
                  border=True)
        m2.metric("Contribution when re-solved", components.money(result.achieved, 2), border=True,
                  help="The model solved again at the required value, as a check.")
        m3.metric("Root-finder iterations", str(result.iterations), border=True)
        solved = state.solve_problem(param.apply(problem, result.value))
        if solved.is_optimal:
            st.markdown("**Plan at the required value**")
            components.plan_table(solved.plan)
    else:
        st.warning(result.message)
    curve = cached_curve(problem.to_json(), key, result.search_low, result.search_high)
    st.plotly_chart(
        charts.goal_seek_chart(curve, result.target, result.value if result.found else None,
                               labels[key], param.is_money, current),
        theme=None, key="gs_chart",
    )
    st.caption(
        "The curve is the optimal contribution at 61 evenly spaced values across the search range. "
        "Flat sections mean that input is not limiting there; kinks are where the set of binding "
        "constraints changes."
    )
elif stored:
    st.info("Inputs or the selected input changed since the last run. Run Goal Seek again.")
