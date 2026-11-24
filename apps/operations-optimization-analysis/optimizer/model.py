"""Product-mix linear programming model.

The model answers one question: how many units of each product should the
plant make in a planning period to earn the most profit contribution, given
limited labor hours, machine hours, and material budget?

Decision variables
    x_i = units of product i to make (continuous, x_i >= 0)

Unit profit contribution (margin)
    m_i = p_i - v_i
    v_i = k * material_cost_i + other_variable_cost_i
          + labor_hours_i * labor_rate + machine_hours_i * machine_rate

    k is a material cost multiplier (1.0 = today's prices, 1.10 = +10%).

Objective
    maximize Z = sum_i m_i * x_i

Constraints
    sum_i labor_hours_i   * x_i <= labor_hours_available
    sum_i machine_hours_i * x_i <= machine_hours_available
    sum_i k * material_cost_i * x_i <= material_budget
    min_units_i <= x_i <= max_units_i      (max_units_i may be "no cap")

Everything in this module is plain Python/NumPy so it can be tested without
Streamlit.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, replace
from typing import Iterable, Mapping

import numpy as np
import pandas as pd

# Column order used everywhere a product table is shown, stored, or exported.
PRODUCT_COLUMNS: tuple[str, ...] = (
    "product_id",
    "product_name",
    "unit_price",
    "material_cost",
    "other_variable_cost",
    "labor_hours",
    "machine_hours",
    "min_units",
    "max_units",
)

NUMERIC_PRODUCT_COLUMNS: tuple[str, ...] = PRODUCT_COLUMNS[2:]

RESOURCE_FIELDS: tuple[str, ...] = (
    "labor_hours_available",
    "machine_hours_available",
    "material_budget",
    "labor_rate",
    "machine_rate",
    "material_cost_multiplier",
)

RESOURCE_LABELS: dict[str, str] = {
    "labor_hours_available": "Labor hours available",
    "machine_hours_available": "Machine hours available",
    "material_budget": "Material budget ($)",
    "labor_rate": "Labor rate ($/hour)",
    "machine_rate": "Machine operating rate ($/hour)",
    "material_cost_multiplier": "Material cost multiplier",
}

PRODUCT_FIELD_LABELS: dict[str, str] = {
    "product_id": "Product ID",
    "product_name": "Product name",
    "unit_price": "Unit price ($)",
    "material_cost": "Material cost per unit ($)",
    "other_variable_cost": "Other variable cost per unit ($)",
    "labor_hours": "Labor hours per unit",
    "machine_hours": "Machine hours per unit",
    "min_units": "Minimum units (commitment)",
    "max_units": "Maximum units (demand cap)",
}


@dataclass(frozen=True)
class ConstraintSpec:
    """Describes one shared-resource constraint row of the LP."""

    key: str
    name: str
    unit: str
    resource_field: str  # field on Resources holding the right-hand side
    usage_field: str  # field on Product holding the per-unit usage


CONSTRAINTS: tuple[ConstraintSpec, ...] = (
    ConstraintSpec("labor", "Labor hours", "hours", "labor_hours_available", "labor_hours"),
    ConstraintSpec("machine", "Machine hours", "hours", "machine_hours_available", "machine_hours"),
    ConstraintSpec("material", "Material budget", "$", "material_budget", "material_cost"),
)

CONSTRAINT_BY_KEY: dict[str, ConstraintSpec] = {spec.key: spec for spec in CONSTRAINTS}


@dataclass(frozen=True)
class Product:
    product_id: str
    product_name: str
    unit_price: float
    material_cost: float
    other_variable_cost: float
    labor_hours: float
    machine_hours: float
    min_units: float = 0.0
    max_units: float | None = None  # None means no demand cap

    @property
    def has_cap(self) -> bool:
        return self.max_units is not None


@dataclass(frozen=True)
class Resources:
    labor_hours_available: float
    machine_hours_available: float
    material_budget: float
    labor_rate: float
    machine_rate: float
    material_cost_multiplier: float = 1.0

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass(frozen=True)
class ProductionProblem:
    """An immutable product-mix problem: products plus shared resources."""

    products: tuple[Product, ...]
    resources: Resources

    # ------------------------------------------------------------------ sizes
    @property
    def n_products(self) -> int:
        return len(self.products)

    @property
    def product_ids(self) -> list[str]:
        return [p.product_id for p in self.products]

    def product_index(self, product_id: str) -> int:
        for i, product in enumerate(self.products):
            if product.product_id == product_id:
                return i
        raise KeyError(f"Unknown product_id: {product_id!r}")

    def product(self, product_id: str) -> Product:
        return self.products[self.product_index(product_id)]

    # ------------------------------------------------------------- economics
    def unit_material_costs(self) -> np.ndarray:
        k = self.resources.material_cost_multiplier
        return np.array([p.material_cost * k for p in self.products], dtype=float)

    def unit_variable_costs(self) -> np.ndarray:
        r = self.resources
        return np.array(
            [
                p.material_cost * r.material_cost_multiplier
                + p.other_variable_cost
                + p.labor_hours * r.labor_rate
                + p.machine_hours * r.machine_rate
                for p in self.products
            ],
            dtype=float,
        )

    def unit_margins(self) -> np.ndarray:
        prices = np.array([p.unit_price for p in self.products], dtype=float)
        return prices - self.unit_variable_costs()

    # ------------------------------------------------------- LP coefficients
    def usage_matrix(self) -> np.ndarray:
        """A_ub: one row per shared resource (labor, machine, material $)."""
        labor = [p.labor_hours for p in self.products]
        machine = [p.machine_hours for p in self.products]
        material = list(self.unit_material_costs())
        return np.array([labor, machine, material], dtype=float).reshape(
            len(CONSTRAINTS), self.n_products
        )

    def rhs(self) -> np.ndarray:
        """b_ub, in the same order as CONSTRAINTS."""
        return np.array(
            [getattr(self.resources, spec.resource_field) for spec in CONSTRAINTS],
            dtype=float,
        )

    def lower_bounds(self) -> np.ndarray:
        return np.array([p.min_units for p in self.products], dtype=float)

    def upper_bounds(self) -> np.ndarray:
        """Demand caps, with np.inf where a product has no cap."""
        return np.array(
            [np.inf if p.max_units is None else p.max_units for p in self.products],
            dtype=float,
        )

    def bounds(self) -> list[tuple[float, float | None]]:
        """Bounds in the format scipy.optimize.linprog expects."""
        return [(p.min_units, p.max_units) for p in self.products]

    # ---------------------------------------------------------- modification
    def with_resource(self, field: str, value: float) -> "ProductionProblem":
        if field not in RESOURCE_FIELDS:
            raise KeyError(f"Unknown resource field: {field!r}")
        return replace(self, resources=replace(self.resources, **{field: float(value)}))

    def with_product_value(
        self, product_id: str, field: str, value: float | None
    ) -> "ProductionProblem":
        if field not in NUMERIC_PRODUCT_COLUMNS:
            raise KeyError(f"Unknown numeric product field: {field!r}")
        if value is None and field != "max_units":
            raise ValueError(f"{field} cannot be empty")
        idx = self.product_index(product_id)
        new_value = None if value is None else float(value)
        updated = replace(self.products[idx], **{field: new_value})
        products = self.products[:idx] + (updated,) + self.products[idx + 1 :]
        return replace(self, products=products)

    # ------------------------------------------------------- serialization
    def products_frame(self, include_economics: bool = False) -> pd.DataFrame:
        rows = [asdict(p) for p in self.products]
        frame = pd.DataFrame(rows, columns=list(PRODUCT_COLUMNS))
        frame["max_units"] = frame["max_units"].astype(float)
        if include_economics:
            frame["unit_variable_cost"] = self.unit_variable_costs()
            margins = self.unit_margins()
            frame["unit_margin"] = margins
            labor = frame["labor_hours"].to_numpy(dtype=float)
            frame["margin_per_labor_hour"] = np.divide(
                margins, labor, out=np.full_like(margins, np.nan), where=labor > 0
            )
        return frame

    def to_dict(self) -> dict:
        return {
            "products": [asdict(p) for p in self.products],
            "resources": self.resources.as_dict(),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True)

    @classmethod
    def from_dict(cls, payload: Mapping) -> "ProductionProblem":
        products = tuple(Product(**dict(p)) for p in payload["products"])
        resources = Resources(**dict(payload["resources"]))
        return cls(products=products, resources=resources)

    @classmethod
    def from_json(cls, text: str) -> "ProductionProblem":
        return cls.from_dict(json.loads(text))

    @classmethod
    def from_frame(cls, products: pd.DataFrame, resources: Resources) -> "ProductionProblem":
        """Build a problem from an already-validated product table."""
        return cls(products=tuple(_rows_to_products(products)), resources=resources)


def _rows_to_products(frame: pd.DataFrame) -> Iterable[Product]:
    for record in frame.to_dict(orient="records"):
        max_units = record.get("max_units")
        if max_units is None or (isinstance(max_units, float) and math.isnan(max_units)):
            max_units = None
        yield Product(
            product_id=str(record["product_id"]),
            product_name=str(record["product_name"]),
            unit_price=float(record["unit_price"]),
            material_cost=float(record["material_cost"]),
            other_variable_cost=float(record["other_variable_cost"]),
            labor_hours=float(record["labor_hours"]),
            machine_hours=float(record["machine_hours"]),
            min_units=float(record.get("min_units", 0.0) or 0.0),
            max_units=None if max_units is None else float(max_units),
        )
