"""Headless UI tests with streamlit.testing.v1.AppTest.

Each test points the app at its own temporary SQLite file through the
OOA_DB_PATH environment variable, so the real database is never touched.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from data import database as db
from data.sample_data import SAMPLE_DIR, sample_products_frame, sample_resources
from optimizer.model import ProductionProblem
from optimizer.solver import solve
from ui.components import money

APP = str(Path(__file__).resolve().parent.parent / "app.py")
PAGES = ["dashboard", "optimizer", "sensitivity", "scenarios", "goal_seek", "data_manager",
         "sql_reports", "about"]
TIMEOUT = 120


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv(db.DB_ENV_VAR, str(tmp_path / "app.db"))
    return AppTest.from_file(APP, default_timeout=TIMEOUT).run()


def _open(at: AppTest, page: str) -> AppTest:
    at.switch_page(f"app_pages/{page}.py").run()
    assert not at.exception, [e.value for e in at.exception]
    return at


def _sample_objective() -> float:
    return solve(ProductionProblem.from_frame(sample_products_frame(), sample_resources())).objective


@pytest.mark.parametrize("page", PAGES)
def test_every_page_renders_without_errors(app, page):
    at = _open(app, page)
    assert not at.error, [e.value for e in at.error]
    assert at.title, "page should have a title"


def test_dashboard_shows_the_solved_contribution(app):
    at = _open(app, "dashboard")
    metric = next(m for m in at.metric if m.label == "Optimal profit contribution")
    assert metric.value == money(_sample_objective())
    assert any("Synthetic data" in c.value for c in at.caption)


def test_about_page_states_rebuild_and_credits(app):
    at = _open(app, "about")
    text = " ".join(x.value for x in at.markdown) + " ".join(x.value for x in at.info)
    assert "expanded portfolio rebuild" in text
    assert "Nathanael Haig" in text and "Tracy Tran" in text


def test_optimizer_applies_new_labor_hours_and_resolves(app):
    at = _open(app, "optimizer")
    labor = next(n for n in at.number_input if n.label == "Labor hours available")
    labor.set_value(3000.0)
    at.form_submit_button[0].click().run()
    assert not at.exception, [e.value for e in at.exception]
    expected = solve(
        ProductionProblem.from_frame(sample_products_frame(), sample_resources())
        .with_resource("labor_hours_available", 3000.0)
    ).objective
    metric = next(m for m in at.metric if m.label == "Total profit contribution")
    assert metric.value == money(expected)


def test_optimizer_explains_an_infeasible_model(app):
    at = _open(app, "optimizer")
    labor = next(n for n in at.number_input if n.label == "Labor hours available")
    labor.set_value(100.0)  # minimum commitments alone need far more
    at.form_submit_button[0].click().run()
    assert not at.exception
    errors = " ".join(e.value for e in at.error)
    assert "Infeasible" in errors
    assert any("minimum commitments alone need" in m.value for m in at.markdown)


def test_goal_seek_finds_and_verifies_a_value(app):
    at = _open(app, "goal_seek")
    run = next(b for b in at.button if b.label == "Run Goal Seek")
    run.click().run()
    assert not at.exception, [e.value for e in at.exception]
    assert at.success, "Goal Seek should succeed for the default target"
    achieved = next(m for m in at.metric if m.label == "Contribution when re-solved")
    target = next(n for n in at.number_input if n.label == "Target profit contribution ($)").value
    assert achieved.value == money(target, 2)


def test_scenario_what_if_is_saved_to_sqlite(app, tmp_path):
    at = _open(app, "scenarios")
    before = len(db.list_scenarios(tmp_path / "app.db"))
    next(t for t in at.text_input if t.label == "Scenario name").set_value("Labor plus 5")
    next(n for n in at.number_input if n.label == "Labor hours (%)").set_value(5.0)
    next(b for b in at.form_submit_button if b.label == "Solve and save scenario").click().run()
    assert not at.exception, [e.value for e in at.exception]
    scenarios = db.list_scenarios(tmp_path / "app.db")
    assert len(scenarios) == before + 1
    saved = scenarios.set_index("name").loc["Labor plus 5"]
    expected = solve(
        ProductionProblem.from_frame(sample_products_frame(), sample_resources())
        .with_resource("labor_hours_available", 2800.0 * 1.05)
    ).objective
    assert saved["total_contribution"] == pytest.approx(expected)


def test_upload_rejects_a_bad_file_with_reasons(app):
    at = _open(app, "data_manager")
    content = (SAMPLE_DIR / "invalid_products_example.csv").read_bytes()
    at.file_uploader[0].upload("invalid.csv", content, "text/csv")
    at.run()
    assert not at.exception, [e.value for e in at.exception]
    assert any("not accepted" in e.value for e in at.error)
    assert any("is not a number" in m.value for m in at.markdown)


def test_upload_accepts_the_sample_workbook_and_saves_it(app, tmp_path):
    at = _open(app, "data_manager")
    content = (SAMPLE_DIR / "sample_dataset.xlsx").read_bytes()
    at.file_uploader[0].upload("my_upload.xlsx", content,
                               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    at.run()
    assert any("passed validation" in s.value for s in at.success)
    next(b for b in at.form_submit_button if b.label == "Save to database and use it").click().run()
    assert not at.exception, [e.value for e in at.exception]
    names = list(db.list_datasets(tmp_path / "app.db")["name"])
    assert "my_upload" in names


def test_sql_report_selection_runs_a_query(app):
    at = _open(app, "sql_reports")
    at.selectbox(key="sql_report").set_value("bottleneck_frequency").run()
    assert not at.exception
    assert at.dataframe, "report result should be shown"
    assert any("Bound parameters" in c.value for c in at.caption)
