"""About & Method: project background, the math model, data notice, and credits."""

from __future__ import annotations

import streamlit as st

from data.sample_data import COMPANY_NAME, SYNTHETIC_NOTICE
from ui import components

st.title("About this project")

st.info(
    "This is an expanded portfolio rebuild of Nathanael Haig's Excel coursework project "
    "\"Operations & Optimization Analysis\". It is not the original class submission.",
    icon=":material/history_edu:",
)

st.subheader("The original coursework")
st.markdown(
    "The original project was built in Microsoft Excel: linear programming models with sensitivity "
    "analysis and Goal Seek, used to evaluate production decisions and maximize profit contribution. "
    "Nathanael Haig is an Information Systems student at Cal State Fullerton (expected graduation May 2027)."
)

st.subheader("What the rebuild adds")
st.markdown(
    """
- The LP is solved in Python with SciPy's `linprog` (HiGHS) instead of Excel Solver.
- Shadow prices come from the solver's dual values, and each one is checked by re-solving with one more unit.
- Ranging (how far a resource or price can move before the answer changes) is computed by re-solving
  and bisecting, because `linprog` does not produce Excel's sensitivity report.
- Goal Seek re-solves the whole optimization for each candidate value and uses SciPy's `brentq`.
- Datasets, saved scenarios and every solved run are stored in SQLite, with parameterized reporting queries.
- CSV/Excel upload with validation, and CSV/Excel export of results.
- An automated test suite (pytest plus Streamlit's AppTest) with hand-checked textbook problems.
"""
)

st.subheader("The model")
st.markdown("Decision variables: $x_i$ = units of product $i$ to make in the planning period (a month).")
st.latex(r"\max\; Z = \sum_i m_i x_i, \qquad m_i = p_i - \left(k\,c^{mat}_i + c^{oth}_i + h^{L}_i w_L + h^{M}_i w_M\right)")
st.latex(r"\sum_i h^{L}_i x_i \le L \qquad \sum_i h^{M}_i x_i \le M \qquad \sum_i k\,c^{mat}_i x_i \le B \qquad \ell_i \le x_i \le u_i")
st.markdown(
    """
- $p_i$ price, $c^{mat}_i$ material cost, $c^{oth}_i$ other variable cost, $h^{L}_i$ and $h^{M}_i$ labor and
  machine hours per unit.
- $w_L$, $w_M$ labor and machine rates; $k$ material price multiplier; $L$, $M$, $B$ labor hours, machine hours
  and material budget available.
- $\\ell_i$ minimum commitment and $u_i$ demand cap (no cap if left empty).
- `linprog` minimizes, so the app passes $-m$ as the cost vector. Total contribution is $Z = -$`res.fun`,
  and a resource's shadow price is $-$`res.ineqlin.marginals`.
"""
)

st.subheader("Data")
st.warning(components.escape_md(SYNTHETIC_NOTICE), icon=":material/science:")
st.markdown(
    f"{COMPANY_NAME} and its 12-month production history were invented for this demo. The history is "
    "built from a fixed random seed, so it can be recreated exactly with `python scripts/build_sample_data.py`."
)

st.subheader("Limitations")
st.markdown(
    """
- One planning period, linear costs, and continuous units (a whole-unit MILP is shown for comparison).
- Ranges are found numerically to a small tolerance rather than read from a simplex tableau.
- On Streamlit Community Cloud the SQLite file lives on the app's local disk, which is not guaranteed to
  persist; saved scenarios and uploads can disappear when the app restarts.
"""
)

st.subheader("Credits")
st.markdown(
    "Built by **Nathanael Haig** and **Tracy Tran**. Source code: "
    "[github.com/enobot/nate (apps/operations-optimization-analysis)](https://github.com/enobot/nate/tree/main/apps/operations-optimization-analysis). "
    "MIT License, Copyright (c) 2026 Nathanael Haig and Tracy Tran."
)
