"""SQLite storage for datasets, scenarios, solved results, and history.

Uses only the standard-library sqlite3 module plus pandas for reading query
results into DataFrames. Every query that includes a value from the user is
parameterized (``?`` or ``:name`` placeholders); SQL text is never built by
string formatting with user input.

A new connection is opened for each operation. SQLite connections are cheap,
and this avoids sharing one connection across Streamlit's script threads.
"""

from __future__ import annotations

import math
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Sequence

import pandas as pd

from optimizer.model import PRODUCT_COLUMNS, RESOURCE_FIELDS, ProductionProblem, Resources
from optimizer.solver import Solution, solve
from optimizer.validation import validate_products, validate_resources

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_ENV_VAR = "OOA_DB_PATH"
SCHEMA_VERSION = "1"

# Scenario/dataset names: must start with a letter or digit (blocks spreadsheet
# formulas) and avoid characters with Markdown/HTML meaning.
NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.,:%&()/'#+-]{0,59}$")
MAX_NOTES_LENGTH = 500

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_info (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
    dataset_id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name                     TEXT    NOT NULL UNIQUE,
    source                   TEXT    NOT NULL CHECK (source IN ('sample', 'upload', 'edited')),
    is_synthetic             INTEGER NOT NULL CHECK (is_synthetic IN (0, 1)),
    labor_hours_available    REAL    NOT NULL CHECK (labor_hours_available >= 0),
    machine_hours_available  REAL    NOT NULL CHECK (machine_hours_available >= 0),
    material_budget          REAL    NOT NULL CHECK (material_budget >= 0),
    labor_rate               REAL    NOT NULL CHECK (labor_rate >= 0),
    machine_rate             REAL    NOT NULL CHECK (machine_rate >= 0),
    material_cost_multiplier REAL    NOT NULL CHECK (material_cost_multiplier > 0),
    created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS dataset_products (
    dataset_id          INTEGER NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
    position            INTEGER NOT NULL,
    product_id          TEXT    NOT NULL,
    product_name        TEXT    NOT NULL,
    unit_price          REAL    NOT NULL CHECK (unit_price >= 0),
    material_cost       REAL    NOT NULL CHECK (material_cost >= 0),
    other_variable_cost REAL    NOT NULL CHECK (other_variable_cost >= 0),
    labor_hours         REAL    NOT NULL CHECK (labor_hours >= 0),
    machine_hours       REAL    NOT NULL CHECK (machine_hours >= 0),
    min_units           REAL    NOT NULL CHECK (min_units >= 0),
    max_units           REAL    CHECK (max_units IS NULL OR max_units >= min_units),
    PRIMARY KEY (dataset_id, product_id)
);

CREATE TABLE IF NOT EXISTS scenarios (
    scenario_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name                     TEXT    NOT NULL UNIQUE,
    notes                    TEXT    NOT NULL DEFAULT '',
    dataset_id               INTEGER REFERENCES datasets(dataset_id) ON DELETE SET NULL,
    is_synthetic             INTEGER NOT NULL CHECK (is_synthetic IN (0, 1)),
    labor_hours_available    REAL    NOT NULL CHECK (labor_hours_available >= 0),
    machine_hours_available  REAL    NOT NULL CHECK (machine_hours_available >= 0),
    material_budget          REAL    NOT NULL CHECK (material_budget >= 0),
    labor_rate               REAL    NOT NULL CHECK (labor_rate >= 0),
    machine_rate             REAL    NOT NULL CHECK (machine_rate >= 0),
    material_cost_multiplier REAL    NOT NULL CHECK (material_cost_multiplier > 0),
    created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS scenario_products (
    scenario_id         INTEGER NOT NULL REFERENCES scenarios(scenario_id) ON DELETE CASCADE,
    position            INTEGER NOT NULL,
    product_id          TEXT    NOT NULL,
    product_name        TEXT    NOT NULL,
    unit_price          REAL    NOT NULL CHECK (unit_price >= 0),
    material_cost       REAL    NOT NULL CHECK (material_cost >= 0),
    other_variable_cost REAL    NOT NULL CHECK (other_variable_cost >= 0),
    labor_hours         REAL    NOT NULL CHECK (labor_hours >= 0),
    machine_hours       REAL    NOT NULL CHECK (machine_hours >= 0),
    min_units           REAL    NOT NULL CHECK (min_units >= 0),
    max_units           REAL    CHECK (max_units IS NULL OR max_units >= min_units),
    PRIMARY KEY (scenario_id, product_id)
);

CREATE TABLE IF NOT EXISTS optimization_runs (
    run_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id        INTEGER NOT NULL REFERENCES scenarios(scenario_id) ON DELETE CASCADE,
    status             TEXT    NOT NULL,
    total_contribution REAL,
    solver_message     TEXT    NOT NULL,
    diagnosis          TEXT    NOT NULL DEFAULT '',
    solved_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_runs_scenario ON optimization_runs (scenario_id, run_id);

CREATE TABLE IF NOT EXISTS run_products (
    run_id          INTEGER NOT NULL REFERENCES optimization_runs(run_id) ON DELETE CASCADE,
    product_id      TEXT    NOT NULL,
    product_name    TEXT    NOT NULL,
    units           REAL    NOT NULL,
    unit_margin     REAL    NOT NULL,
    contribution    REAL    NOT NULL,
    position        TEXT    NOT NULL,
    PRIMARY KEY (run_id, product_id)
);

CREATE TABLE IF NOT EXISTS run_constraints (
    run_id          INTEGER NOT NULL REFERENCES optimization_runs(run_id) ON DELETE CASCADE,
    constraint_key  TEXT    NOT NULL,
    constraint_name TEXT    NOT NULL,
    used            REAL    NOT NULL,
    available       REAL    NOT NULL,
    slack           REAL    NOT NULL,
    shadow_price    REAL,
    is_binding      INTEGER NOT NULL CHECK (is_binding IN (0, 1)),
    PRIMARY KEY (run_id, constraint_key)
);

CREATE TABLE IF NOT EXISTS production_history (
    month              TEXT    NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    product_id         TEXT    NOT NULL,
    units_produced     INTEGER NOT NULL CHECK (units_produced >= 0),
    revenue            REAL    NOT NULL CHECK (revenue >= 0),
    material_spend     REAL    NOT NULL CHECK (material_spend >= 0),
    labor_hours_used   REAL    NOT NULL CHECK (labor_hours_used >= 0),
    machine_hours_used REAL    NOT NULL CHECK (machine_hours_used >= 0),
    PRIMARY KEY (month, product_id)
);
"""

_PRODUCT_INSERT_COLUMNS = ("position",) + PRODUCT_COLUMNS


class StorageError(ValueError):
    """A user-correctable problem saving or loading data (duplicate name, etc.)."""


def default_db_path() -> Path:
    override = os.environ.get(DB_ENV_VAR)
    if override:
        return Path(override)
    return PROJECT_ROOT / "instance" / "operations.db"


@contextmanager
def connect(db_path: Path | str | None = None) -> Iterator[sqlite3.Connection]:
    """Open a connection in autocommit mode; use transaction() for writes."""
    path = Path(db_path) if db_path is not None else default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """BEGIN IMMEDIATE ... COMMIT, rolling back on any exception."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def init_db(db_path: Path | str | None = None, *, seed: bool = True) -> Path:
    """Create tables if needed and (optionally) load the synthetic sample data once."""
    path = Path(db_path) if db_path is not None else default_db_path()
    with connect(path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT OR IGNORE INTO schema_info (key, value) VALUES ('schema_version', ?)",
            (SCHEMA_VERSION,),
        )
    if seed:
        seed_sample_data(path)
    return path


def _check_name(name: str, what: str) -> str:
    cleaned = (name or "").strip()
    if not NAME_PATTERN.match(cleaned):
        raise StorageError(
            f"{what} name must be 1-60 characters, start with a letter or digit, and use only "
            "letters, digits, spaces and . , : % & ( ) / ' # + - _"
        )
    return cleaned


def _resource_values(resources: Resources) -> tuple[float, ...]:
    return tuple(float(getattr(resources, f)) for f in RESOURCE_FIELDS)


def _product_rows(products: pd.DataFrame) -> list[tuple]:
    rows = []
    for position, record in enumerate(products.to_dict(orient="records")):
        max_units = record["max_units"]
        if max_units is None or (isinstance(max_units, float) and math.isnan(max_units)):
            max_units = None
        rows.append(
            (
                position,
                str(record["product_id"]),
                str(record["product_name"]),
                float(record["unit_price"]),
                float(record["material_cost"]),
                float(record["other_variable_cost"]),
                float(record["labor_hours"]),
                float(record["machine_hours"]),
                float(record["min_units"]),
                None if max_units is None else float(max_units),
            )
        )
    return rows


# ------------------------------------------------------------------ datasets
def save_dataset(
    db_path: Path | str | None,
    name: str,
    products: pd.DataFrame,
    resources: Resources,
    *,
    source: str,
    is_synthetic: bool,
    conn: sqlite3.Connection | None = None,
) -> int:
    """Validate and insert a dataset. Raises StorageError on bad input or a duplicate name."""
    name = _check_name(name, "Dataset")
    report = validate_products(products, row_offset=1)
    if not report.ok:
        raise StorageError("Product table is invalid: " + "; ".join(report.errors))
    checked, errors = validate_resources(resources.as_dict())
    if errors or checked is None:
        raise StorageError("Resource settings are invalid: " + "; ".join(errors))

    def _insert(c: sqlite3.Connection) -> int:
        try:
            cur = c.execute(
                "INSERT INTO datasets (name, source, is_synthetic, labor_hours_available, "
                "machine_hours_available, material_budget, labor_rate, machine_rate, "
                "material_cost_multiplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (name, source, int(bool(is_synthetic))) + _resource_values(checked),
            )
        except sqlite3.IntegrityError as exc:
            if "UNIQUE" in str(exc):
                raise StorageError(f"A dataset named '{name}' already exists.") from exc
            raise
        dataset_id = int(cur.lastrowid)
        c.executemany(
            "INSERT INTO dataset_products (dataset_id, position, product_id, product_name, unit_price, "
            "material_cost, other_variable_cost, labor_hours, machine_hours, min_units, max_units) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(dataset_id,) + row for row in _product_rows(report.products)],
        )
        return dataset_id

    if conn is not None:
        return _insert(conn)
    with connect(db_path) as c, transaction(c):
        return _insert(c)


def list_datasets(db_path: Path | str | None = None) -> pd.DataFrame:
    sql = """
        SELECT d.dataset_id, d.name, d.source, d.is_synthetic, d.created_at,
               COUNT(p.product_id) AS products
        FROM datasets AS d
        LEFT JOIN dataset_products AS p ON p.dataset_id = d.dataset_id
        GROUP BY d.dataset_id
        ORDER BY d.dataset_id
    """
    with connect(db_path) as conn:
        return pd.read_sql_query(sql, conn)


def _products_frame_from_rows(rows: Sequence[sqlite3.Row]) -> pd.DataFrame:
    frame = pd.DataFrame([dict(r) for r in rows], columns=list(PRODUCT_COLUMNS))
    for column in PRODUCT_COLUMNS[2:]:
        frame[column] = frame[column].astype(float)
    frame["product_id"] = frame["product_id"].astype(str)
    frame["product_name"] = frame["product_name"].astype(str)
    return frame


def _resources_from_row(row: sqlite3.Row) -> Resources:
    return Resources(**{f: float(row[f]) for f in RESOURCE_FIELDS})


def load_dataset(db_path: Path | str | None, dataset_id: int) -> tuple[dict, pd.DataFrame, Resources]:
    with connect(db_path) as conn:
        meta = conn.execute("SELECT * FROM datasets WHERE dataset_id = ?", (int(dataset_id),)).fetchone()
        if meta is None:
            raise StorageError(f"Dataset {dataset_id} does not exist.")
        rows = conn.execute(
            "SELECT * FROM dataset_products WHERE dataset_id = ? ORDER BY position",
            (int(dataset_id),),
        ).fetchall()
    return dict(meta), _products_frame_from_rows(rows), _resources_from_row(meta)


def sample_dataset_id(db_path: Path | str | None = None) -> int | None:
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT dataset_id FROM datasets WHERE source = 'sample' ORDER BY dataset_id LIMIT 1"
        ).fetchone()
    return None if row is None else int(row["dataset_id"])


def delete_dataset(db_path: Path | str | None, dataset_id: int) -> None:
    with connect(db_path) as conn, transaction(conn):
        row = conn.execute("SELECT source FROM datasets WHERE dataset_id = ?", (int(dataset_id),)).fetchone()
        if row is None:
            raise StorageError(f"Dataset {dataset_id} does not exist.")
        if row["source"] == "sample":
            raise StorageError("The built-in sample dataset cannot be deleted.")
        conn.execute("DELETE FROM datasets WHERE dataset_id = ?", (int(dataset_id),))


# ----------------------------------------------------------------- scenarios
def _insert_run(conn: sqlite3.Connection, scenario_id: int, solution: Solution) -> int:
    cur = conn.execute(
        "INSERT INTO optimization_runs (scenario_id, status, total_contribution, solver_message, diagnosis) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            scenario_id,
            solution.status,
            solution.objective if solution.is_optimal else None,
            solution.solver_message,
            "\n".join(solution.diagnosis),
        ),
    )
    run_id = int(cur.lastrowid)
    if solution.is_optimal:
        conn.executemany(
            "INSERT INTO run_products (run_id, product_id, product_name, units, unit_margin, contribution, position) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (run_id, r.product_id, r.product_name, float(r.units), float(r.unit_margin),
                 float(r.contribution), r.position)
                for r in solution.plan.itertuples(index=False)
            ],
        )
        conn.executemany(
            "INSERT INTO run_constraints (run_id, constraint_key, constraint_name, used, available, slack, "
            "shadow_price, is_binding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    run_id, r.key, r.constraint, float(r.used), float(r.available), float(r.slack),
                    None if (r.shadow_price is None or math.isnan(r.shadow_price)) else float(r.shadow_price),
                    int(bool(r.binding)),
                )
                for r in solution.constraints.itertuples(index=False)
            ],
        )
    return run_id


def save_scenario(
    db_path: Path | str | None,
    name: str,
    problem: ProductionProblem,
    solution: Solution | None = None,
    *,
    notes: str = "",
    dataset_id: int | None = None,
    is_synthetic: bool = True,
    overwrite: bool = False,
    conn: sqlite3.Connection | None = None,
) -> int:
    """Store the scenario inputs and one solved run, all in one transaction."""
    name = _check_name(name, "Scenario")
    notes = (notes or "").strip()
    if len(notes) > MAX_NOTES_LENGTH:
        raise StorageError(f"Notes are limited to {MAX_NOTES_LENGTH} characters.")
    if solution is None:
        solution = solve(problem)

    def _write(c: sqlite3.Connection) -> int:
        existing = c.execute("SELECT scenario_id FROM scenarios WHERE name = ?", (name,)).fetchone()
        if existing is not None:
            if not overwrite:
                raise StorageError(f"A scenario named '{name}' already exists. Choose another name or overwrite it.")
            c.execute("DELETE FROM scenarios WHERE scenario_id = ?", (existing["scenario_id"],))
        cur = c.execute(
            "INSERT INTO scenarios (name, notes, dataset_id, is_synthetic, labor_hours_available, "
            "machine_hours_available, material_budget, labor_rate, machine_rate, material_cost_multiplier) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, notes, dataset_id, int(bool(is_synthetic))) + _resource_values(problem.resources),
        )
        scenario_id = int(cur.lastrowid)
        c.executemany(
            "INSERT INTO scenario_products (scenario_id, position, product_id, product_name, unit_price, "
            "material_cost, other_variable_cost, labor_hours, machine_hours, min_units, max_units) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(scenario_id,) + row for row in _product_rows(problem.products_frame())],
        )
        _insert_run(c, scenario_id, solution)
        return scenario_id

    if conn is not None:
        return _write(conn)
    with connect(db_path) as c, transaction(c):
        return _write(c)


def add_run(db_path: Path | str | None, scenario_id: int, solution: Solution) -> int:
    with connect(db_path) as conn, transaction(conn):
        if conn.execute("SELECT 1 FROM scenarios WHERE scenario_id = ?", (int(scenario_id),)).fetchone() is None:
            raise StorageError(f"Scenario {scenario_id} does not exist.")
        return _insert_run(conn, int(scenario_id), solution)


LATEST_RUNS_CTE = """
    WITH latest AS (
        SELECT r.*,
               ROW_NUMBER() OVER (PARTITION BY r.scenario_id ORDER BY r.run_id DESC) AS rn
        FROM optimization_runs AS r
    )
"""


def list_scenarios(db_path: Path | str | None = None) -> pd.DataFrame:
    sql = LATEST_RUNS_CTE + """
        SELECT s.scenario_id, s.name, s.notes, s.is_synthetic, s.created_at,
               l.run_id, l.status, l.total_contribution, l.solved_at,
               (SELECT COUNT(*) FROM optimization_runs r2 WHERE r2.scenario_id = s.scenario_id) AS runs
        FROM scenarios AS s
        LEFT JOIN latest AS l ON l.scenario_id = s.scenario_id AND l.rn = 1
        ORDER BY s.scenario_id
    """
    with connect(db_path) as conn:
        return pd.read_sql_query(sql, conn)


def load_scenario(db_path: Path | str | None, scenario_id: int) -> tuple[dict, ProductionProblem]:
    with connect(db_path) as conn:
        meta = conn.execute("SELECT * FROM scenarios WHERE scenario_id = ?", (int(scenario_id),)).fetchone()
        if meta is None:
            raise StorageError(f"Scenario {scenario_id} does not exist.")
        rows = conn.execute(
            "SELECT * FROM scenario_products WHERE scenario_id = ? ORDER BY position",
            (int(scenario_id),),
        ).fetchall()
    problem = ProductionProblem.from_frame(_products_frame_from_rows(rows), _resources_from_row(meta))
    return dict(meta), problem


def delete_scenario(db_path: Path | str | None, scenario_id: int) -> None:
    with connect(db_path) as conn, transaction(conn):
        cur = conn.execute("DELETE FROM scenarios WHERE scenario_id = ?", (int(scenario_id),))
        if cur.rowcount == 0:
            raise StorageError(f"Scenario {scenario_id} does not exist.")


def compare_scenarios(
    db_path: Path | str | None, scenario_ids: Sequence[int]
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Latest run of each selected scenario: (summary, product units, constraint use)."""
    ids = [int(i) for i in scenario_ids]
    if not ids:
        empty = pd.DataFrame()
        return empty, empty, empty
    placeholders = ", ".join("?" for _ in ids)  # one "?" per id; values are still bound
    summary_sql = LATEST_RUNS_CTE + f"""
        SELECT s.scenario_id, s.name AS scenario, l.run_id, l.status, l.total_contribution,
               s.labor_hours_available, s.machine_hours_available, s.material_budget,
               s.labor_rate, s.machine_rate, s.material_cost_multiplier, l.solved_at
        FROM scenarios AS s
        JOIN latest AS l ON l.scenario_id = s.scenario_id AND l.rn = 1
        WHERE s.scenario_id IN ({placeholders})
        ORDER BY s.scenario_id
    """
    products_sql = LATEST_RUNS_CTE + f"""
        SELECT s.scenario_id, s.name AS scenario, p.product_id, p.product_name,
               p.units, p.unit_margin, p.contribution, p.position
        FROM scenarios AS s
        JOIN latest AS l ON l.scenario_id = s.scenario_id AND l.rn = 1
        JOIN run_products AS p ON p.run_id = l.run_id
        WHERE s.scenario_id IN ({placeholders})
        ORDER BY s.scenario_id, p.product_id
    """
    constraints_sql = LATEST_RUNS_CTE + f"""
        SELECT s.scenario_id, s.name AS scenario, c.constraint_key, c.constraint_name,
               c.used, c.available, c.slack, c.shadow_price, c.is_binding
        FROM scenarios AS s
        JOIN latest AS l ON l.scenario_id = s.scenario_id AND l.rn = 1
        JOIN run_constraints AS c ON c.run_id = l.run_id
        WHERE s.scenario_id IN ({placeholders})
        ORDER BY s.scenario_id, c.constraint_key
    """
    with connect(db_path) as conn:
        summary = pd.read_sql_query(summary_sql, conn, params=ids)
        products = pd.read_sql_query(products_sql, conn, params=ids)
        constraints = pd.read_sql_query(constraints_sql, conn, params=ids)
    return summary, products, constraints


# ------------------------------------------------------------------- history
def load_history(db_path: Path | str | None = None) -> pd.DataFrame:
    with connect(db_path) as conn:
        return pd.read_sql_query(
            "SELECT * FROM production_history ORDER BY month, product_id", conn
        )


def replace_history(conn: sqlite3.Connection, history: pd.DataFrame) -> None:
    conn.execute("DELETE FROM production_history")
    conn.executemany(
        "INSERT INTO production_history (month, product_id, units_produced, revenue, material_spend, "
        "labor_hours_used, machine_hours_used) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (str(r.month), str(r.product_id), int(r.units_produced), float(r.revenue),
             float(r.material_spend), float(r.labor_hours_used), float(r.machine_hours_used))
            for r in history.itertuples(index=False)
        ],
    )


# ---------------------------------------------------------------- seed data
def seed_sample_data(db_path: Path | str | None = None) -> int:
    """Load the synthetic sample dataset, its history, and three example
    scenarios the first time the database is used. Safe to call repeatedly:
    the check and the inserts run inside one IMMEDIATE transaction, so two
    sessions starting at once cannot both seed."""
    from data.sample_data import SAMPLE_DATASET_NAME, SAMPLE_DIR

    products = pd.read_csv(SAMPLE_DIR / "products.csv", dtype=str)
    resources_raw = pd.read_csv(SAMPLE_DIR / "resources.csv", dtype=str)
    history = pd.read_csv(SAMPLE_DIR / "production_history.csv")
    report = validate_products(products)
    if not report.ok:
        raise RuntimeError("Bundled sample products failed validation: " + "; ".join(report.errors))
    resources, errors = validate_resources(dict(zip(resources_raw["parameter"], resources_raw["value"])))
    if errors or resources is None:
        raise RuntimeError("Bundled sample resources failed validation: " + "; ".join(errors))

    with connect(db_path) as conn, transaction(conn):
        row = conn.execute(
            "SELECT dataset_id FROM datasets WHERE source = 'sample' ORDER BY dataset_id LIMIT 1"
        ).fetchone()
        if row is not None:
            return int(row["dataset_id"])
        dataset_id = save_dataset(
            None, SAMPLE_DATASET_NAME, report.products, resources,
            source="sample", is_synthetic=True, conn=conn,
        )
        replace_history(conn, history)
        base = ProductionProblem.from_frame(report.products, resources)
        examples = [
            ("Baseline (sample)", "Sample data as delivered.", base),
            (
                "Overtime: +10% labor hours",
                "Adds 10% labor hours with everything else unchanged.",
                base.with_resource("labor_hours_available", resources.labor_hours_available * 1.10),
            ),
            (
                "Material prices +12%",
                "All material costs 12% higher; budget unchanged.",
                base.with_resource("material_cost_multiplier", 1.12),
            ),
        ]
        for name, notes, problem in examples:
            save_scenario(
                None, name, problem, solve(problem), notes=notes,
                dataset_id=dataset_id, is_synthetic=True, conn=conn,
            )
        return dataset_id


def table_schema(db_path: Path | str | None = None) -> pd.DataFrame:
    """Column list for every table (for the SQL page's schema viewer)."""
    rows = []
    with connect(db_path) as conn:
        tables = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        for table in tables:
            # PRAGMA cannot take bound parameters; the table name comes from
            # sqlite_master (not from the user) and is quoted as an identifier.
            quoted = '"' + table.replace('"', '""') + '"'
            for col in conn.execute(f"PRAGMA table_info({quoted})"):
                rows.append(
                    {
                        "table": table,
                        "column": col["name"],
                        "type": col["type"],
                        "not_null": bool(col["notnull"]),
                        "primary_key": bool(col["pk"]),
                    }
                )
    return pd.DataFrame(rows)
