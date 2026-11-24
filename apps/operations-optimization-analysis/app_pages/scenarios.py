"""Scenarios: build what-if cases, save them in SQLite, and compare them side by side."""

from __future__ import annotations

import sqlite3

import streamlit as st

from data import database as db
from data.files import frame_to_csv_bytes
from ui import charts, components, state

st.title("What-if scenarios")
st.caption(
    "A scenario is a saved copy of every input plus the solved result. Scenarios are stored in the "
    "SQLite database, so they can be reloaded, re-solved and compared."
)
components.data_notice()

if flash := st.session_state.pop("scenario_flash", None):
    st.toast(flash)

path = state.db_path()
w = state.working()
problem = state.working_problem()

with st.expander("Create a what-if scenario from the working data", expanded=False, icon=":material/add:"):
    with st.form("what_if"):
        st.caption("Each change is a percentage applied to the current working value. 0 means unchanged.")
        f1, f2, f3 = st.columns(3)
        labor_pct = f1.number_input("Labor hours (%)", -100.0, 500.0, 0.0, 5.0)
        machine_pct = f2.number_input("Machine hours (%)", -100.0, 500.0, 0.0, 5.0)
        budget_pct = f3.number_input("Material budget (%)", -100.0, 500.0, 0.0, 5.0)
        g1, g2, g3 = st.columns(3)
        material_pct = g1.number_input("Material prices (%)", -90.0, 500.0, 0.0, 1.0)
        labor_rate_pct = g2.number_input("Labor rate (%)", -100.0, 500.0, 0.0, 1.0)
        demand_pct = g3.number_input("All demand caps (%)", -100.0, 500.0, 0.0, 5.0)
        price_product = st.selectbox(
            "Change one product's price", ["(none)"] + problem.product_ids,
            format_func=lambda pid: pid if pid == "(none)" else problem.product(pid).product_name,
        )
        price_pct = st.number_input("Price change for that product (%)", -100.0, 500.0, 0.0, 1.0)
        name = st.text_input("Scenario name", max_chars=60, placeholder="e.g. Labor +5%, chairs +3% price")
        notes = st.text_area("Notes (optional)", max_chars=500)
        create = st.form_submit_button("Solve and save scenario", type="primary", icon=":material/save:")
    if create:
        r = problem.resources
        what_if = (
            problem.with_resource("labor_hours_available", r.labor_hours_available * (1 + labor_pct / 100))
            .with_resource("machine_hours_available", r.machine_hours_available * (1 + machine_pct / 100))
            .with_resource("material_budget", r.material_budget * (1 + budget_pct / 100))
            .with_resource("material_cost_multiplier", r.material_cost_multiplier * (1 + material_pct / 100))
            .with_resource("labor_rate", r.labor_rate * (1 + labor_rate_pct / 100))
        )
        for product in problem.products:
            if product.max_units is not None and demand_pct:
                what_if = what_if.with_product_value(
                    product.product_id, "max_units", max(product.max_units * (1 + demand_pct / 100), 0.0)
                )
        if price_product != "(none)" and price_pct:
            old_price = problem.product(price_product).unit_price
            what_if = what_if.with_product_value(price_product, "unit_price", old_price * (1 + price_pct / 100))
        try:
            sol = state.solve_problem(what_if)
            scenario_id = db.save_scenario(
                path, name, what_if, sol, notes=notes, dataset_id=w["dataset_id"],
                is_synthetic=w["is_synthetic"],
            )
        except db.StorageError as exc:
            st.error(str(exc))
        except sqlite3.Error as exc:
            st.error(f"Database error while saving ({type(exc).__name__}). Nothing was saved.")
        else:
            st.session_state["scenario_flash"] = f"Saved scenario #{scenario_id} ({sol.status})."
            st.rerun()

scenarios = db.list_scenarios(path)
if scenarios.empty:
    st.info("No saved scenarios yet. Save one from the Optimizer page or create one above.")
    st.stop()

st.subheader("Saved scenarios")
st.dataframe(
    scenarios[["scenario_id", "name", "status", "total_contribution", "runs", "is_synthetic", "notes", "solved_at"]],
    hide_index=True,
    column_config={
        "scenario_id": st.column_config.NumberColumn("ID", format="%d"),
        "name": "Scenario",
        "status": "Latest status",
        "total_contribution": st.column_config.NumberColumn("Latest contribution", format="dollar"),
        "runs": st.column_config.NumberColumn("Runs", format="%d"),
        "is_synthetic": st.column_config.CheckboxColumn("Synthetic"),
        "notes": "Notes",
        "solved_at": "Last solved (UTC)",
    },
)

names = dict(zip(scenarios["scenario_id"].astype(int), scenarios["name"]))

# Drop remembered selections that point at scenarios deleted since the last run.
if "compare_ids" in st.session_state:
    st.session_state["compare_ids"] = [i for i in st.session_state["compare_ids"] if i in names]
    default_ids = None
else:
    default_ids = list(names)[:3]
if st.session_state.get("manage_id") not in names:
    st.session_state.pop("manage_id", None)

st.subheader("Compare scenarios")
selected = st.multiselect(
    "Scenarios to compare (up to 4)", list(names), default=default_ids, format_func=names.get,
    max_selections=4, key="compare_ids",
)
if len(selected) < 2:
    st.info("Pick at least two scenarios to compare.")
else:
    summary, plan_rows, cons_rows = db.compare_scenarios(path, selected)
    order = [names[i] for i in selected]
    summary["order"] = summary["scenario"].map({n: i for i, n in enumerate(order)})
    summary = summary.sort_values("order").drop(columns="order")
    baseline = summary.iloc[0]
    summary["vs_first"] = summary["total_contribution"] - baseline["total_contribution"]
    colors = charts.scenario_colors(order)
    st.dataframe(
        summary[["scenario", "status", "total_contribution", "vs_first", "labor_hours_available",
                 "machine_hours_available", "material_budget", "material_cost_multiplier", "labor_rate"]],
        hide_index=True,
        column_config={
            "scenario": "Scenario",
            "status": "Status",
            "total_contribution": st.column_config.NumberColumn("Contribution", format="dollar"),
            "vs_first": st.column_config.NumberColumn(f"vs {baseline['scenario']}", format="dollar"),
            "labor_hours_available": st.column_config.NumberColumn("Labor h", format="localized"),
            "machine_hours_available": st.column_config.NumberColumn("Machine h", format="localized"),
            "material_budget": st.column_config.NumberColumn("Material budget", format="dollar"),
            "material_cost_multiplier": st.column_config.NumberColumn("Material x", format="%.3f"),
            "labor_rate": st.column_config.NumberColumn("Labor rate", format="dollar"),
        },
    )
    optimal_names = set(summary.loc[summary["status"] == "optimal", "scenario"])
    if len(optimal_names) < len(summary):
        st.warning("Some selected scenarios have no optimal plan; they show no units or utilization.")
    st.plotly_chart(charts.scenario_total_chart(summary, colors), theme=None, key="cmp_total")
    if not plan_rows.empty:
        plan_rows["order"] = plan_rows["scenario"].map({n: i for i, n in enumerate(order)})
        plan_rows = plan_rows.sort_values(["order"], kind="stable")
        left, right = st.columns(2)
        with left:
            st.plotly_chart(charts.scenario_units_chart(plan_rows, colors), theme=None, key="cmp_units")
        with right:
            cons_rows["order"] = cons_rows["scenario"].map({n: i for i, n in enumerate(order)})
            cons_rows = cons_rows.sort_values(["order"], kind="stable")
            st.plotly_chart(charts.scenario_utilization_chart(cons_rows, colors), theme=None, key="cmp_util")
        pivot = plan_rows.pivot_table(index="product_name", columns="scenario", values="units", sort=False)
        pivot = pivot[[n for n in order if n in pivot.columns]]
        with st.expander("Units by product and scenario"):
            st.dataframe(pivot)
    st.download_button("Download comparison (CSV)", frame_to_csv_bytes(summary),
                       file_name="scenario_comparison.csv", mime="text/csv")

st.subheader("Manage a scenario")
target = st.selectbox("Scenario", list(names), format_func=names.get, key="manage_id")
m1, m2, m3 = st.columns(3)
if m1.button("Load into working data", icon=":material/input:"):
    loaded = state.load_scenario(int(target))
    st.session_state["scenario_flash"] = f"Loaded '{loaded}'. The Optimizer and other pages now use it."
    st.rerun()
if m2.button("Re-solve and record a new run", icon=":material/refresh:"):
    _, scenario_problem = db.load_scenario(path, int(target))
    run_id = db.add_run(path, int(target), state.solve_problem(scenario_problem))
    st.session_state["scenario_flash"] = f"Recorded run #{run_id}."
    st.rerun()
with m3.popover("Delete", icon=":material/delete:"):
    st.write(f"Delete '{names[int(target)]}' and all of its runs? This cannot be undone.")
    if st.button("Yes, delete it", type="primary", key="confirm_delete_scenario"):
        db.delete_scenario(path, int(target))
        st.session_state["scenario_flash"] = "Scenario deleted."
        st.rerun()
