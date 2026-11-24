"""Operations & Optimization Analysis - Streamlit entry point.

Run locally with:
    streamlit run app.py

Pages live in app_pages/ and are registered with st.navigation below.
(The folder is deliberately not named pages/: Streamlit treats a pages/
folder as the older automatic multipage mode, and mixing that with
st.navigation is avoided.)
"""

from __future__ import annotations

import sqlite3

import streamlit as st

from ui import components, state

st.set_page_config(
    page_title="Operations & Optimization Analysis",
    page_icon=":material/insights:",
    layout="wide",
)

try:
    state.bootstrap()
except (sqlite3.Error, OSError, RuntimeError) as exc:
    st.error(
        "The app could not open or initialize its SQLite database. "
        f"Details: {type(exc).__name__}. Check that the folder is writable "
        "or set OOA_DB_PATH to a writable location."
    )
    st.stop()

pages = {
    "Analysis": [
        st.Page("app_pages/dashboard.py", title="Dashboard", icon=":material/dashboard:", default=True),
        st.Page("app_pages/optimizer.py", title="Optimizer", icon=":material/tune:"),
        st.Page("app_pages/sensitivity.py", title="Sensitivity", icon=":material/ssid_chart:"),
        st.Page("app_pages/scenarios.py", title="Scenarios", icon=":material/compare_arrows:"),
        st.Page("app_pages/goal_seek.py", title="Goal Seek", icon=":material/flag:"),
    ],
    "Data": [
        st.Page("app_pages/data_manager.py", title="Data & Files", icon=":material/upload_file:"),
        st.Page("app_pages/sql_reports.py", title="SQL Reports", icon=":material/database:"),
    ],
    "Project": [
        st.Page("app_pages/about.py", title="About & Method", icon=":material/info:"),
    ],
}

page = st.navigation(pages)
components.sidebar_status()
page.run()
