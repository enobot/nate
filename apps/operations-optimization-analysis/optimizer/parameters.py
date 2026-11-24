"""A uniform way to point at one model input so it can be swept or goal-sought."""

from __future__ import annotations

from dataclasses import dataclass

from optimizer.model import (
    NUMERIC_PRODUCT_COLUMNS,
    PRODUCT_FIELD_LABELS,
    RESOURCE_FIELDS,
    RESOURCE_LABELS,
    ProductionProblem,
)

# Effect on optimal contribution when the input goes UP (+1 helps, -1 hurts).
# Used only for wording and for choosing the "best case" end of a search.
RESOURCE_DIRECTION = {
    "labor_hours_available": 1,
    "machine_hours_available": 1,
    "material_budget": 1,
    "labor_rate": -1,
    "machine_rate": -1,
    "material_cost_multiplier": -1,
}
PRODUCT_DIRECTION = {
    "unit_price": 1,
    "max_units": 1,
    "min_units": -1,
    "material_cost": -1,
    "other_variable_cost": -1,
    "labor_hours": -1,
    "machine_hours": -1,
}

RESOURCE_UNITS = {
    "labor_hours_available": "hours",
    "machine_hours_available": "hours",
    "material_budget": "$",
    "labor_rate": "$/hour",
    "machine_rate": "$/hour",
    "material_cost_multiplier": "x",
}
RESOURCE_PHRASES = {
    "labor_hours_available": "labor hours available",
    "machine_hours_available": "machine hours available",
    "material_budget": "the material budget",
    "labor_rate": "the labor rate",
    "machine_rate": "the machine operating rate",
    "material_cost_multiplier": "the material cost multiplier",
}
PRODUCT_PHRASES = {
    "unit_price": "unit price",
    "max_units": "demand cap",
    "min_units": "minimum commitment",
    "material_cost": "material cost per unit",
    "other_variable_cost": "other variable cost per unit",
    "labor_hours": "labor hours per unit",
    "machine_hours": "machine hours per unit",
}

PRODUCT_UNITS = {
    "unit_price": "$",
    "material_cost": "$",
    "other_variable_cost": "$",
    "labor_hours": "hours/unit",
    "machine_hours": "hours/unit",
    "min_units": "units",
    "max_units": "units",
}


@dataclass(frozen=True)
class Parameter:
    """Either a shared resource setting or one numeric field of one product."""

    kind: str  # "resource" or "product"
    field: str
    product_id: str | None = None

    def __post_init__(self) -> None:
        if self.kind == "resource":
            if self.field not in RESOURCE_FIELDS:
                raise ValueError(f"Unknown resource field {self.field!r}")
        elif self.kind == "product":
            if self.field not in NUMERIC_PRODUCT_COLUMNS or not self.product_id:
                raise ValueError("Product parameters need a numeric field and a product_id")
        else:
            raise ValueError(f"Unknown parameter kind {self.kind!r}")

    @property
    def key(self) -> str:
        if self.kind == "resource":
            return f"resource:{self.field}"
        return f"product:{self.product_id}:{self.field}"

    @classmethod
    def from_key(cls, key: str) -> "Parameter":
        parts = key.split(":")
        if parts[0] == "resource" and len(parts) == 2:
            return cls("resource", parts[1])
        if parts[0] == "product" and len(parts) == 3:
            return cls("product", parts[2], parts[1])
        raise ValueError(f"Bad parameter key {key!r}")

    @property
    def direction(self) -> int:
        if self.kind == "resource":
            return RESOURCE_DIRECTION[self.field]
        return PRODUCT_DIRECTION[self.field]

    @property
    def unit(self) -> str:
        if self.kind == "resource":
            return RESOURCE_UNITS[self.field]
        return PRODUCT_UNITS[self.field]

    @property
    def is_money(self) -> bool:
        return self.unit.startswith("$")

    def label(self, problem: ProductionProblem) -> str:
        if self.kind == "resource":
            return RESOURCE_LABELS[self.field]
        name = problem.product(self.product_id).product_name
        return f"{name}: {PRODUCT_FIELD_LABELS[self.field].lower()}"

    def phrase(self, problem: ProductionProblem) -> str:
        """Lower-case wording for use inside a sentence."""
        if self.kind == "resource":
            return RESOURCE_PHRASES[self.field]
        name = problem.product(self.product_id).product_name
        return f"the {name} {PRODUCT_PHRASES[self.field]}"

    def current(self, problem: ProductionProblem) -> float | None:
        if self.kind == "resource":
            return float(getattr(problem.resources, self.field))
        value = getattr(problem.product(self.product_id), self.field)
        return None if value is None else float(value)

    def apply(self, problem: ProductionProblem, value: float) -> ProductionProblem:
        if value is None or value < 0:
            raise ValueError(f"{self.key} must be >= 0 (got {value})")
        if self.kind == "resource":
            if self.field == "material_cost_multiplier" and value <= 0:
                raise ValueError("material_cost_multiplier must be > 0")
            return problem.with_resource(self.field, value)
        return problem.with_product_value(self.product_id, self.field, value)


def sweepable_parameters(problem: ProductionProblem) -> list[Parameter]:
    """Inputs with a positive current value.

    Sweeps are expressed as a percentage of the current value, so inputs that
    are zero or empty (no demand cap) cannot be swept this way.
    """
    params = [Parameter("resource", f) for f in RESOURCE_FIELDS
              if float(getattr(problem.resources, f)) > 0]
    for product in problem.products:
        for field in ("unit_price", "max_units", "min_units", "material_cost",
                      "other_variable_cost", "labor_hours", "machine_hours"):
            p = Parameter("product", field, product.product_id)
            value = p.current(problem)
            if value is not None and value > 0:
                params.append(p)
    return params


def goal_seek_parameters(problem: ProductionProblem) -> list[Parameter]:
    """Inputs that make sense to solve for in Goal Seek."""
    params = [Parameter("resource", f) for f in RESOURCE_FIELDS]
    for product in problem.products:
        params.append(Parameter("product", "unit_price", product.product_id))
        if product.max_units is not None:
            params.append(Parameter("product", "max_units", product.product_id))
        params.append(Parameter("product", "material_cost", product.product_id))
    return params
