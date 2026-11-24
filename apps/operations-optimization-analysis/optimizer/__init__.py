"""Optimization core: the product-mix LP model, solver wrapper, sensitivity
analysis, Goal Seek, and recommendation text.

Nothing in this package imports Streamlit, so every function can be unit
tested and reused from scripts.
"""

from optimizer.model import (
    CONSTRAINTS,
    PRODUCT_COLUMNS,
    RESOURCE_FIELDS,
    Product,
    ProductionProblem,
    Resources,
)
from optimizer.parameters import Parameter
from optimizer.solver import Solution, evaluate_plan, objective_value, solve

__all__ = [
    "CONSTRAINTS",
    "PRODUCT_COLUMNS",
    "RESOURCE_FIELDS",
    "Parameter",
    "Product",
    "ProductionProblem",
    "Resources",
    "Solution",
    "evaluate_plan",
    "objective_value",
    "solve",
]
