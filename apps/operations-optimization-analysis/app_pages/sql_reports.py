"""SQL Reports: fixed, parameterized reporting queries against the app's SQLite database."""

from __future__ import annotations

import sqlite3

import streamlit as st

from data import database as db
from data.files import frame_to_csv_bytes
from data.queries import REPORTS, REPORTS_BY_KEY, ReportParameterError, run_report
from ui import components, state

st.title("SQL reports")
st.caption(
    "Reporting queries over the datasets, scenarios and solver results stored in SQLite. "
    "Each query uses named placeholders (:name); the values you choose are passed separately "
    "as bound parameters, never pasted into the SQL text."
)
components.data_notice()

path = state.db_path()
key = st.selectbox("Report", [r.key for r in REPORTS], format_func=lambda k: REPORTS_BY_KEY[k].title,
                   key="sql_report")
report = REPORTS_BY_KEY[key]
st.markdown(components.escape_md(report.description))

values: dict[str, object] = {}
if report.params:
    cols = st.columns(len(report.params))
    for col, param in zip(cols, report.params):
        if param.kind == "bool":
            values[param.name] = col.checkbox(param.label, value=bool(param.default), key=f"sqlp_{key}_{param.name}")
        elif param.kind == "int":
            values[param.name] = col.number_input(param.label, min_value=param.min_value,
                                                  max_value=param.max_value, value=int(param.default),
                                                  step=1, key=f"sqlp_{key}_{param.name}")
        elif param.kind == "month":
            values[param.name] = col.text_input(param.label, value=str(param.default), max_chars=7,
                                                key=f"sqlp_{key}_{param.name}")
        elif param.kind == "scenario":
            scenarios = db.list_scenarios(path)
            options = dict(zip(scenarios["scenario_id"].astype(int), scenarios["name"]))
            if not options:
                col.info("No scenarios saved yet.")
                values[param.name] = None
            else:
                values[param.name] = col.selectbox(param.label, list(options), format_func=options.get,
                                                   key=f"sqlp_{key}_{param.name}")
        elif param.kind == "dataset":
            datasets = db.list_datasets(path)
            options = dict(zip(datasets["dataset_id"].astype(int), datasets["name"]))
            values[param.name] = col.selectbox(param.label, list(options), format_func=options.get,
                                               key=f"sqlp_{key}_{param.name}")

st.code(report.sql, language="sql")

try:
    result = run_report(path, key, values)
except ReportParameterError as exc:
    st.error(str(exc))
except sqlite3.Error as exc:
    st.error(f"The query failed ({type(exc).__name__}).")
else:
    st.caption(f"Bound parameters: {components.escape_md(str(values) if values else 'none')} - {len(result)} row(s)")
    st.dataframe(result, hide_index=True)
    st.download_button("Download result (CSV)", frame_to_csv_bytes(result), file_name=f"{key}.csv",
                       mime="text/csv", icon=":material/download:")

with st.expander("Database schema"):
    st.dataframe(db.table_schema(path), hide_index=True)
    st.caption(
        "Foreign keys use ON DELETE CASCADE so deleting a scenario removes its runs, products and "
        "constraint rows in the same transaction. CHECK constraints reject negative quantities at the "
        "database level as a second line of defense behind the app's validation."
    )
