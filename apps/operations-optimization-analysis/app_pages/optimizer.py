"""Optimizer: edit inputs, solve the LP, read the plan, shadow prices and recommendations."""

from __future__ import annotations

import math
import sqlite3

import pandas as pd
import streamlit as st

from data import database as db
from data.files import frame_to_csv_bytes, solution_to_excel_bytes
from data.sample_data import SYNTHETIC_NOTICE
from optimizer.model import CONSTRAINTS, PRODUCT_COLUMNS
from optimizer.recommendations import recommendations
from optimizer.solver import objective_value
from optimizer.validation import InputValidationError, build_problem, economic_warnings
from ui import charts, components, state
from ui.theme import color_map

st.title("Optimizer")
st.caption(
    "Maximize total profit contribution subject to labor hours, machine hours, material budget, "
    "minimum commitments and demand caps. Solved with SciPy's linprog (HiGHS)."
)
components.data_notice()

if flash := st.session_state.pop("optimizer_flash", None):
    st.toast(flash)

w = state.working()
r = w["resources"]
version = st.session_state.get(state.EDITOR_VERSION_KEY, 0)

with st.form("optimizer_inputs"):
    st.subheader("Resources and costs")
    a1, a2, a3 = st.columns(3)
    labor = a1.number_input("Labor hours available", min_value=0.0, max_value=1e7,
                            value=float(r.labor_hours_available), step=50.0, key=f"in_labor_{version}")
    machine = a2.number_input("Machine hours available", min_value=0.0, max_value=1e7,
                              value=float(r.machine_hours_available), step=25.0, key=f"in_machine_{version}")
    budget = a3.number_input("Material budget ($)", min_value=0.0, max_value=1e9,
                             value=float(r.material_budget), step=1000.0, key=f"in_budget_{version}")
    b1, b2, b3 = st.columns(3)
    labor_rate = b1.number_input("Labor rate ($/hour)", min_value=0.0, max_value=1e4,
                                 value=float(r.labor_rate), step=0.5, key=f"in_lrate_{version}")
    machine_rate = b2.number_input("Machine operating rate ($/hour)", min_value=0.0, max_value=1e4,
                                   value=float(r.machine_rate), step=0.5, key=f"in_mrate_{version}")
    material_change = b3.number_input(
        "Material price change (%)", min_value=-90.0, max_value=900.0,
        value=round((float(r.material_cost_multiplier) - 1.0) * 100.0, 4), step=1.0,
        help="Scales every product's material cost (and its use of the material budget). "
             "+10 means materials cost 10% more than the table shows.",
        key=f"in_mat_{version}",
    )

    st.subheader("Products")
    st.caption(
        "Per-unit values for one planning period. Leave max units empty for no demand cap. "
        "Add or delete rows to change the product line."
    )
    edited = st.data_editor(
        w["products"][list(PRODUCT_COLUMNS)],
        key=state.editor_key(),
        num_rows="dynamic",
        hide_index=True,
        column_config={
            "product_id": st.column_config.TextColumn("ID", required=True, max_chars=20),
            "product_name": st.column_config.TextColumn("Product", required=True, max_chars=60),
            "unit_price": st.column_config.NumberColumn("Price ($)", min_value=0.0, format="%.2f", required=True),
            "material_cost": st.column_config.NumberColumn("Material ($/unit)", min_value=0.0, format="%.2f", required=True),
            "other_variable_cost": st.column_config.NumberColumn("Other variable ($/unit)", min_value=0.0, format="%.2f", required=True),
            "labor_hours": st.column_config.NumberColumn("Labor h/unit", min_value=0.0, format="%.2f", required=True),
            "machine_hours": st.column_config.NumberColumn("Machine h/unit", min_value=0.0, format="%.2f", required=True),
            "min_units": st.column_config.NumberColumn("Min units", min_value=0.0, format="%.0f"),
            "max_units": st.column_config.NumberColumn("Max units (cap)", min_value=0.0, format="%.0f"),
        },
    )
    submitted = st.form_submit_button("Apply changes and solve", type="primary", icon=":material/play_arrow:")

if submitted:
    resource_values = {
        "labor_hours_available": labor,
        "machine_hours_available": machine,
        "material_budget": budget,
        "labor_rate": labor_rate,
        "machine_rate": machine_rate,
        "material_cost_multiplier": 1.0 + material_change / 100.0,
    }
    try:
        new_problem = build_problem(edited, resource_values, row_offset=1)
    except InputValidationError as exc:
        st.error(
            "The inputs were not applied. Fix these problems and submit again "
            "(the results below are still for the last valid inputs):"
        )
        st.markdown("\n".join(f"- {components.escape_md(e)}" for e in exc.errors))
    else:
        state.update_working(new_problem.products_frame(), new_problem.resources)
        st.session_state["optimizer_flash"] = "Inputs applied and model re-solved."
        st.rerun()

if w["dataset_id"] is not None and st.button("Reset inputs to the saved dataset", icon=":material/restart_alt:"):
    state.load_dataset(int(w["dataset_id"]))
    st.session_state["optimizer_flash"] = "Inputs reset to the saved dataset."
    st.rerun()

problem = state.working_problem()
solution = state.solve_problem(problem)

st.divider()
st.header("Results")
components.solution_status(solution)
for note in economic_warnings(problem):
    st.warning(note)

if not solution.is_optimal:
    st.info(
        "Infeasible means no plan satisfies every constraint at once (usually minimum commitments that "
        "need more resources than exist). Unbounded means the model could earn unlimited profit, which "
        "signals a missing limit. Adjust the inputs above and apply them again."
    )
    st.stop()

integer_solution = state.solve_problem(problem, integer=True)
rhs, prices = state.ranges_for(problem)
recs = recommendations(problem, solution, rhs, prices, integer_solution)
colors = color_map(problem.product_ids)

m1, m2, m3, m4 = st.columns(4)
m1.metric("Total profit contribution", components.money(solution.objective), border=True)
m2.metric("Units planned", f"{solution.plan['units'].sum():,.1f}", border=True)
m3.metric("Binding constraints", str(len(solution.binding_keys())), border=True,
          help=", ".join(solution.binding_names()) or "None")
if integer_solution.is_optimal:
    m4.metric("Whole-unit plan", components.money(integer_solution.objective),
              delta=components.money(integer_solution.objective - solution.objective), border=True,
              help="Best plan when every product must be a whole number of units (MILP).")

tab_recs, tab_plan, tab_cons, tab_int, tab_export = st.tabs(
    ["Recommendations", "Production plan", "Constraints and shadow prices", "Whole units", "Export and save"]
)

with tab_recs:
    st.caption(
        "Built from this solve: plan, slack, shadow prices (HiGHS duals), reduced costs, and ranges "
        "found by re-solving. Each statement assumes the other inputs stay as they are."
    )
    components.recommendations_list(recs)

with tab_plan:
    st.plotly_chart(charts.plan_chart(solution.plan, colors), theme=None, key="opt_plan")
    components.plan_table(solution.plan)

with tab_cons:
    st.plotly_chart(charts.utilization_chart(solution.constraints), theme=None, key="opt_util")
    extra_rows = []
    by_key = {x.key: x for x in rhs}
    for spec in CONSTRAINTS:
        available = float(getattr(problem.resources, spec.resource_field))
        plus_one = objective_value(problem.with_resource(spec.resource_field, available + 1.0))
        rng = by_key.get(spec.key)
        extra_rows.append(
            {
                "key": spec.key,
                "resolve_delta": None if plus_one is None else plus_one - solution.objective,
                "range_low": None if rng is None else rng.lower,
                "range_high": None if (rng is None or math.isinf(rng.upper)) else rng.upper,
                "next_limit": None if rng is None else (rng.next_limit or ("no limit found" if math.isinf(rng.upper) else "")),
            }
        )
    components.constraints_table(solution.constraints, pd.DataFrame(extra_rows))
    st.markdown(
        "**How to read this.** *Slack* is unused capacity. A constraint is *binding* when its slack is "
        "zero. The *shadow price* is the extra contribution from one more unit of that resource; it comes "
        "from the solver's dual values (`res.ineqlin.marginals`, sign-flipped because linprog minimizes "
        "the negative of profit). The *re-solve +1* column checks it by actually solving again with one "
        "more unit. The valid range comes from re-solving and bisecting, because linprog does not return "
        "Excel-style allowable increase/decrease values."
    )

with tab_int:
    if integer_solution.is_optimal:
        comparison = solution.plan[["product_name", "units"]].rename(columns={"units": "LP units"})
        comparison["Whole units (MILP)"] = integer_solution.plan["units"].to_numpy()
        st.dataframe(comparison, hide_index=True)
        st.caption(
            f"LP contribution {components.money(solution.objective, 2)} vs whole-unit contribution "
            f"{components.money(integer_solution.objective, 2)}. Integer programs have no shadow prices, "
            "so the sensitivity analysis on other pages uses the LP."
        )
    else:
        components.solution_status(integer_solution)

with tab_export:
    st.subheader("Download results")
    notice = SYNTHETIC_NOTICE if w["is_synthetic"] else None
    ranges_frame = pd.DataFrame([vars(x) for x in rhs])
    d1, d2, d3 = st.columns(3)
    d1.download_button("Production plan (CSV)", frame_to_csv_bytes(solution.plan),
                       file_name="production_plan.csv", mime="text/csv", icon=":material/download:")
    d2.download_button("Constraints (CSV)", frame_to_csv_bytes(solution.constraints),
                       file_name="constraints.csv", mime="text/csv", icon=":material/download:")
    d3.download_button(
        "Full report (Excel)",
        solution_to_excel_bytes(problem, solution, recs, title=w["label"], synthetic_notice=notice,
                                ranges=ranges_frame),
        file_name="optimization_report.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        icon=":material/download:",
    )

    st.subheader("Save as a scenario")
    with st.form("save_scenario"):
        name = st.text_input("Scenario name", max_chars=60, placeholder="e.g. Overtime in March")
        notes = st.text_area("Notes (optional)", max_chars=500)
        overwrite = st.checkbox("Overwrite a scenario with the same name")
        save = st.form_submit_button("Save scenario", icon=":material/save:")
    if save:
        try:
            scenario_id = db.save_scenario(
                state.db_path(), name, problem, solution, notes=notes,
                dataset_id=w["dataset_id"], is_synthetic=w["is_synthetic"], overwrite=overwrite,
            )
        except db.StorageError as exc:
            st.error(str(exc))
        except sqlite3.Error as exc:
            st.error(f"Database error while saving ({type(exc).__name__}). Nothing was saved.")
        else:
            st.success(f"Saved scenario #{scenario_id}. Compare it on the Scenarios page.")
