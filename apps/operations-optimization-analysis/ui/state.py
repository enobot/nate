"""Session state and cached computations for the Streamlit pages.

The "working scenario" (products + resource settings) lives in
st.session_state so every page analyzes the same inputs. Solver results are
cached with st.cache_data keyed by the problem's JSON, so moving between
pages does not re-solve an unchanged model.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from data import database as db
from optimizer.model import ProductionProblem, Resources
from optimizer.sensitivity import PriceRange, RhsRange, price_ranges, rhs_ranges
from optimizer.solver import Solution, solve

WORKING_KEY = "working"
EDITOR_VERSION_KEY = "editor_version"


def db_path() -> Path:
    return db.default_db_path()


def bootstrap() -> None:
    """Create/seed the database once per session and load the sample dataset."""
    if not st.session_state.get("db_ready"):
        db.init_db(db_path())
        st.session_state["db_ready"] = True
    if WORKING_KEY not in st.session_state:
        dataset_id = db.sample_dataset_id(db_path())
        if dataset_id is None:  # should not happen: init_db seeds it
            raise RuntimeError("The sample dataset is missing from the database.")
        load_dataset(dataset_id)


def load_dataset(dataset_id: int) -> None:
    meta, products, resources = db.load_dataset(db_path(), dataset_id)
    set_working(
        products,
        resources,
        label=str(meta["name"]),
        dataset_id=int(meta["dataset_id"]),
        is_synthetic=bool(meta["is_synthetic"]),
    )


def load_scenario(scenario_id: int) -> str:
    meta, problem = db.load_scenario(db_path(), scenario_id)
    set_working(
        problem.products_frame(),
        problem.resources,
        label=f"Scenario: {meta['name']}",
        dataset_id=meta.get("dataset_id"),
        is_synthetic=bool(meta["is_synthetic"]),
    )
    return str(meta["name"])


def set_working(
    products: pd.DataFrame,
    resources: Resources,
    *,
    label: str,
    dataset_id: int | None,
    is_synthetic: bool,
    edited: bool = False,
) -> None:
    st.session_state[WORKING_KEY] = {
        "products": products.reset_index(drop=True),
        "resources": resources,
        "label": label,
        "dataset_id": dataset_id,
        "is_synthetic": is_synthetic,
        "edited": edited,
    }
    # A new editor key makes st.data_editor start fresh from the new data.
    st.session_state[EDITOR_VERSION_KEY] = st.session_state.get(EDITOR_VERSION_KEY, 0) + 1


def update_working(products: pd.DataFrame, resources: Resources) -> None:
    current = working()
    set_working(
        products,
        resources,
        label=current["label"],
        dataset_id=current["dataset_id"],
        is_synthetic=current["is_synthetic"],
        edited=True,
    )


def working() -> dict:
    return st.session_state[WORKING_KEY]


def editor_key() -> str:
    return f"products_editor_{st.session_state.get(EDITOR_VERSION_KEY, 0)}"


def working_problem() -> ProductionProblem:
    w = working()
    return ProductionProblem.from_frame(w["products"], w["resources"])


@st.cache_data(show_spinner=False, max_entries=256)
def _solve_cached(problem_json: str, integer: bool) -> Solution:
    return solve(ProductionProblem.from_json(problem_json), integer=integer)


@st.cache_data(show_spinner="Finding ranges by re-solving the model...", max_entries=64)
def _ranges_cached(problem_json: str) -> tuple[list[RhsRange], list[PriceRange]]:
    problem = ProductionProblem.from_json(problem_json)
    base = solve(problem)
    return rhs_ranges(problem, base), price_ranges(problem, base)


def solve_problem(problem: ProductionProblem, integer: bool = False) -> Solution:
    return _solve_cached(problem.to_json(), integer)


def ranges_for(problem: ProductionProblem) -> tuple[list[RhsRange], list[PriceRange]]:
    return _ranges_cached(problem.to_json())
