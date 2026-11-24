"""Reporting queries shown on the SQL Reports page.

Each report is fixed SQL text with named placeholders (:name). User input
only ever reaches SQLite as bound parameter values, never as SQL text.
Parameters are type-checked here before the query runs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from data.database import connect

MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@dataclass(frozen=True)
class ReportParam:
    name: str
    label: str
    kind: str  # "int", "month", "bool", "scenario", "dataset"
    default: Any = None
    min_value: int | None = None
    max_value: int | None = None


@dataclass(frozen=True)
class Report:
    key: str
    title: str
    description: str
    sql: str
    params: tuple[ReportParam, ...] = field(default_factory=tuple)


REPORTS: tuple[Report, ...] = (
    Report(
        key="scenario_leaderboard",
        title="Scenario leaderboard",
        description=(
            "Ranks saved scenarios by the profit contribution of their most recent solve. "
            "A window function (ROW_NUMBER) picks the latest run per scenario."
        ),
        sql="""WITH latest AS (
    SELECT r.*,
           ROW_NUMBER() OVER (PARTITION BY r.scenario_id ORDER BY r.run_id DESC) AS rn
    FROM optimization_runs AS r
)
SELECT s.name                          AS scenario,
       l.status,
       ROUND(l.total_contribution, 2)  AS total_contribution,
       s.labor_hours_available,
       s.machine_hours_available,
       s.material_budget,
       s.material_cost_multiplier,
       l.solved_at
FROM scenarios AS s
JOIN latest AS l
  ON l.scenario_id = s.scenario_id AND l.rn = 1
WHERE l.status = 'optimal' OR :include_non_optimal = 1
ORDER BY l.total_contribution DESC
LIMIT :limit;""",
        params=(
            ReportParam("include_non_optimal", "Include infeasible/unbounded runs", "bool", False),
            ReportParam("limit", "Max rows", "int", 20, 1, 500),
        ),
    ),
    Report(
        key="bottleneck_frequency",
        title="Bottleneck frequency across scenarios",
        description=(
            "How often each resource is binding in the latest run of each scenario, and its "
            "average shadow price when it binds. Shows which constraint limits the business most often."
        ),
        sql="""WITH latest AS (
    SELECT r.*,
           ROW_NUMBER() OVER (PARTITION BY r.scenario_id ORDER BY r.run_id DESC) AS rn
    FROM optimization_runs AS r
    WHERE r.status = 'optimal'
)
SELECT c.constraint_name,
       SUM(c.is_binding)                                          AS times_binding,
       COUNT(*)                                                   AS scenarios,
       ROUND(100.0 * SUM(c.is_binding) / COUNT(*), 1)             AS pct_binding,
       ROUND(AVG(CASE WHEN c.is_binding = 1 THEN c.shadow_price END), 4) AS avg_shadow_price_when_binding,
       ROUND(AVG(c.used / NULLIF(c.available, 0)) * 100, 1)       AS avg_utilization_pct
FROM run_constraints AS c
JOIN latest AS l ON l.run_id = c.run_id AND l.rn = 1
GROUP BY c.constraint_name
ORDER BY times_binding DESC, c.constraint_name;""",
    ),
    Report(
        key="scenario_product_mix",
        title="Product mix for one scenario",
        description=(
            "Units, unit margin and contribution by product for the latest run of the selected "
            "scenario, with each product's share of total contribution."
        ),
        sql="""WITH latest AS (
    SELECT run_id
    FROM optimization_runs
    WHERE scenario_id = :scenario_id
    ORDER BY run_id DESC
    LIMIT 1
)
SELECT p.product_id,
       p.product_name,
       ROUND(p.units, 2)         AS units,
       ROUND(p.unit_margin, 2)   AS unit_margin,
       ROUND(p.contribution, 2)  AS contribution,
       ROUND(100.0 * p.contribution / NULLIF(SUM(p.contribution) OVER (), 0), 1) AS pct_of_total,
       p.position
FROM run_products AS p
JOIN latest AS l ON l.run_id = p.run_id
ORDER BY p.contribution DESC;""",
        params=(ReportParam("scenario_id", "Scenario", "scenario"),),
    ),
    Report(
        key="product_economics",
        title="Product economics for a dataset",
        description=(
            "Unit variable cost and contribution margin computed in SQL from the dataset's stored "
            "prices, costs and rates, plus margin per labor hour and per machine hour."
        ),
        sql="""SELECT p.product_id,
       p.product_name,
       p.unit_price,
       ROUND(p.material_cost * d.material_cost_multiplier
             + p.other_variable_cost
             + p.labor_hours * d.labor_rate
             + p.machine_hours * d.machine_rate, 2)            AS unit_variable_cost,
       ROUND(p.unit_price
             - (p.material_cost * d.material_cost_multiplier
                + p.other_variable_cost
                + p.labor_hours * d.labor_rate
                + p.machine_hours * d.machine_rate), 2)        AS unit_margin,
       ROUND((p.unit_price
             - (p.material_cost * d.material_cost_multiplier
                + p.other_variable_cost
                + p.labor_hours * d.labor_rate
                + p.machine_hours * d.machine_rate))
             / NULLIF(p.labor_hours, 0), 2)                    AS margin_per_labor_hour,
       ROUND((p.unit_price
             - (p.material_cost * d.material_cost_multiplier
                + p.other_variable_cost
                + p.labor_hours * d.labor_rate
                + p.machine_hours * d.machine_rate))
             / NULLIF(p.machine_hours, 0), 2)                  AS margin_per_machine_hour
FROM dataset_products AS p
JOIN datasets AS d ON d.dataset_id = p.dataset_id
WHERE p.dataset_id = :dataset_id
ORDER BY unit_margin DESC;""",
        params=(ReportParam("dataset_id", "Dataset", "dataset"),),
    ),
    Report(
        key="monthly_history",
        title="Monthly production history (synthetic)",
        description=(
            "Totals per month from the synthetic production history: units, revenue, material "
            "spend, and labor and machine hours used, for a chosen month range."
        ),
        sql="""SELECT month,
       SUM(units_produced)              AS units_produced,
       ROUND(SUM(revenue), 2)           AS revenue,
       ROUND(SUM(material_spend), 2)    AS material_spend,
       ROUND(SUM(labor_hours_used), 1)  AS labor_hours_used,
       ROUND(SUM(machine_hours_used), 1) AS machine_hours_used,
       ROUND(SUM(revenue) / NULLIF(SUM(units_produced), 0), 2) AS revenue_per_unit
FROM production_history
WHERE month BETWEEN :start_month AND :end_month
GROUP BY month
ORDER BY month;""",
        params=(
            ReportParam("start_month", "From month (YYYY-MM)", "month", "2025-11"),
            ReportParam("end_month", "To month (YYYY-MM)", "month", "2026-10"),
        ),
    ),
)

REPORTS_BY_KEY: dict[str, Report] = {r.key: r for r in REPORTS}


class ReportParameterError(ValueError):
    pass


def coerce_params(report: Report, values: Mapping[str, Any]) -> dict[str, Any]:
    """Type-check report parameters; raise ReportParameterError with a readable message."""
    clean: dict[str, Any] = {}
    for param in report.params:
        raw = values.get(param.name, param.default)
        if param.kind == "bool":
            clean[param.name] = 1 if bool(raw) else 0
        elif param.kind in ("int", "scenario", "dataset"):
            try:
                number = int(raw)
            except (TypeError, ValueError):
                raise ReportParameterError(f"{param.label} must be a whole number.") from None
            if param.min_value is not None and number < param.min_value:
                raise ReportParameterError(f"{param.label} must be at least {param.min_value}.")
            if param.max_value is not None and number > param.max_value:
                raise ReportParameterError(f"{param.label} must be at most {param.max_value}.")
            clean[param.name] = number
        elif param.kind == "month":
            text = str(raw or "").strip()
            if not MONTH_PATTERN.match(text):
                raise ReportParameterError(f"{param.label} must look like 2026-03.")
            clean[param.name] = text
        else:  # pragma: no cover - guarded by the report definitions above
            raise ReportParameterError(f"Unsupported parameter type {param.kind}")
    if report.key == "monthly_history" and clean["start_month"] > clean["end_month"]:
        raise ReportParameterError("The start month must not be after the end month.")
    return clean


def run_report(db_path: Path | str | None, key: str, values: Mapping[str, Any] | None = None) -> pd.DataFrame:
    if key not in REPORTS_BY_KEY:
        raise ReportParameterError(f"Unknown report {key!r}.")
    report = REPORTS_BY_KEY[key]
    params = coerce_params(report, values or {})
    with connect(db_path) as conn:
        return pd.read_sql_query(report.sql, conn, params=params)
