"""Shared fixtures. Every test that touches SQLite uses a temporary database."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.sample_data import sample_products_frame, sample_resources  # noqa: E402
from optimizer.model import Product, ProductionProblem, Resources  # noqa: E402


def wyndor(
    plant1: float = 4.0,
    plant2: float = 12.0,
    plant3: float = 18.0,
    cap_b: float | None = None,
    min_a: float = 0.0,
) -> ProductionProblem:
    """The Wyndor Glass Co. textbook LP (Hillier & Lieberman), mapped onto this app's model.

        maximize   Z = 3 x1 + 5 x2
        subject to       x1        <= 4    (plant 1 -> "labor hours")
                              2 x2 <= 12   (plant 2 -> "machine hours")
                   3 x1 + 2 x2     <= 18   (plant 3 -> "material budget", $)
                   x1, x2 >= 0

    Rates are zero and the material multiplier is 1, so unit margin =
    price - material cost. Prices are chosen so the margins are exactly 3 and 5:
    product A price 6 - material 3 = 3, product B price 7 - material 2 = 5.
    """
    products = (
        Product("A", "Product A", 6.0, 3.0, 0.0, 1.0, 0.0, min_a, None),
        Product("B", "Product B", 7.0, 2.0, 0.0, 0.0, 2.0, 0.0, cap_b),
    )
    resources = Resources(
        labor_hours_available=plant1,
        machine_hours_available=plant2,
        material_budget=plant3,
        labor_rate=0.0,
        machine_rate=0.0,
        material_cost_multiplier=1.0,
    )
    return ProductionProblem(products, resources)


@pytest.fixture
def wyndor_problem() -> ProductionProblem:
    return wyndor()


@pytest.fixture
def sample_problem() -> ProductionProblem:
    return ProductionProblem.from_frame(sample_products_frame(), sample_resources())


@pytest.fixture
def tmp_db(tmp_path) -> Path:
    from data.database import init_db

    path = tmp_path / "test.db"
    init_db(path)
    return path


@pytest.fixture
def empty_db(tmp_path) -> Path:
    from data.database import init_db

    path = tmp_path / "empty.db"
    init_db(path, seed=False)
    return path
