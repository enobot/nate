# Operations & Optimization Analysis

A Streamlit app that decides how many of each product a small manufacturer should build each month to earn the most profit contribution, given limited labor hours, machine hours, and material budget. It solves a real linear program with SciPy, explains the answer in plain English, and lets you test what-if scenarios, run sensitivity sweeps, and Goal Seek a target profit.

> **Expanded portfolio rebuild.** This project is an expanded rebuild of Nathanael Haig's Excel coursework project *Operations & Optimization Analysis*, which used linear programming models with sensitivity analysis and Goal Seek to evaluate production decisions and maximize profit contribution. This repository is not the original class submission. The Excel version was the starting point; this version re-implements the same ideas in Python and adds a database, file upload/export, automated tests, and a web interface.

**Synthetic data.** The company in the app, *Juniper Oak Furniture Co.*, is fictional. Every price, cost, capacity, and history value was made up for demonstration, and the app labels it that way on every page.

- Live demo: *(add the Streamlit Community Cloud URL after deploying, see [Deployment](#deployment))*
- Source: https://github.com/enobot/operations-optimization-analysis

---

## Contents

1. [Objectives](#objectives)
2. [Technologies and why](#technologies-and-why)
3. [Features](#features)
4. [The mathematical model](#the-mathematical-model)
5. [Architecture](#architecture)
6. [Setup](#setup)
7. [Usage](#usage)
8. [Implementation details](#implementation-details)
9. [Testing](#testing)
10. [Challenges this design solves](#challenges-this-design-solves)
11. [Deployment](#deployment)
12. [What's next](#whats-next)
13. [License and credits](#license-and-credits)

---

## Objectives

- Rebuild the Excel product-mix model as code where every number can be traced and re-checked.
- Use a real solver (HiGHS through `scipy.optimize.linprog`) and report its results correctly, including shadow prices for a maximization problem solved as a minimization.
- Show the same analysis Excel Solver gives (binding constraints, slack, shadow prices, allowable ranges, Goal Seek) and say plainly where the numbers come from.
- Store datasets, scenarios, and solved results in SQL and query them with parameterized reports.
- Treat uploads as untrusted input and test the whole thing automatically.

## Technologies and why

| Technology | Version | Why it is used |
|---|---|---|
| Python | 3.13 | Main language; everything else is a Python library. |
| SciPy (`linprog`, `brentq`) | 1.18.1 | `linprog(method="highs")` solves the LP and returns dual values; `brentq` is the root finder behind Goal Seek. |
| pandas | 3.1.1 | Tables for products, plans, constraints, history, and SQL results; CSV/Excel reading and writing. |
| NumPy | 2.5.5 | Coefficient matrices and vector math for the model. |
| SQLite (`sqlite3` standard library) | 3.50.4 bundled | File-based SQL database with no server to run, which fits a portfolio app. |
| Plotly | 7.1.0 | Interactive charts (hover values) with a dark template. |
| Streamlit | 1.67.0 | Web interface in Python, with built-in widgets, caching, and a headless test runner (`AppTest`). |
| openpyxl | 3.1.5 | Excel engine pandas uses to read uploads and write the results workbook. |
| pytest | 9.2.0 | Automated tests. |

All versions in `requirements.txt` are the exact versions the tests were run with.

## Features

Everything listed here is implemented and covered by tests.

- **Dashboard**: optimal contribution, gain versus the recent production mix, binding constraints, plan chart, utilization chart, unit margins, and a 12-month synthetic history (revenue, estimated contribution, labor hours vs capacity).
- **Optimizer**: edit labor hours, machine hours, material budget, labor and machine rates, a material price change (%), and the product table (prices, costs, hours per unit, minimum units, demand caps; add or delete products). Shows the plan, slack, shadow prices, a "re-solve with +1 unit" check next to each shadow price, the whole-unit (integer) plan for comparison, and plain-English recommendations.
- **Infeasible / unbounded handling**: the app explains which minimum commitments exceed which resource (and by how much), or which product makes the model unbounded.
- **Sensitivity**: parametric sweeps of any input (contribution, product mix, and shadow prices as the input changes), resource and price ranges found by re-solving, and a tornado chart of which inputs move profit most.
- **What-if scenarios**: create scenarios from percentage changes, save the current inputs, reload, re-solve (each re-solve is stored as a new run), delete, and compare up to four scenarios in a table and charts.
- **Goal Seek**: find the value of one input (a product's price, a demand cap, labor/machine hours, material budget, rates, material cost) that reaches a target contribution, verified by re-solving. Unreachable targets get an explanation with the best value possible.
- **Data & Files**: upload CSV or Excel with validation and clear row/column error messages, save uploads to SQLite, switch datasets, and download the working data, sample files, and a file with deliberate errors for trying the validator.
- **Exports**: production plan and constraints as CSV, and a full Excel report (summary, plan, constraints, ranges, inputs, recommendations).
- **SQL Reports**: five parameterized reporting queries shown with their SQL text, plus a schema viewer.
- **About & Method**: the rebuild statement, the model in math notation, the data notice, limitations, and credits.

## The mathematical model

### Variables

`x_i` = units of product *i* to make in the planning period (one month). Units are continuous in the LP; the app also solves a whole-unit version for comparison.

### Objective

Maximize total profit contribution:

```
maximize  Z = Σ m_i · x_i

m_i = p_i − v_i                                   (unit contribution margin)
v_i = k · material_cost_i + other_variable_cost_i
      + labor_hours_i · labor_rate + machine_hours_i · machine_rate
```

`k` is the material cost multiplier (1.00 = today's prices, 1.10 = 10% more expensive).

### Constraints

```
Σ labor_hours_i   · x_i  ≤  labor hours available      (L)
Σ machine_hours_i · x_i  ≤  machine hours available    (M)
Σ k · material_cost_i · x_i  ≤  material budget ($)    (B)
min_units_i ≤ x_i ≤ max_units_i                        (commitments and demand caps; a blank cap means no cap)
```

Because labor and machine time are already priced into `v_i`, a shadow price for labor is the value of an extra hour *on top of* the wage. Paying up to `labor_rate + shadow price` per extra hour (for example, overtime) still increases contribution.

### Solving a maximization with a minimizer

`linprog` only minimizes, so the app passes `c = −m`. Every result is then converted back:

| Quantity | From HiGHS | Meaning in the app |
|---|---|---|
| Total contribution | `−res.fun` | Z |
| Shadow price of resource *k* | `−res.ineqlin.marginals[k]` | dZ/db_k, ≥ 0 for a "≤" resource |
| Slack of resource *k* | `res.ineqlin.residual[k]` (recomputed as b − Ax) | unused capacity |
| Value of +1 unit of demand cap | `−res.upper.marginals[j]` | ≥ 0 when the product is at its cap |
| Cost of +1 unit of minimum commitment | `res.lower.marginals[j]` | ≥ 0 when the product is held at its minimum |

### Reading duals and slack: a small worked example

The tests use the Wyndor Glass problem from the Hillier & Lieberman textbook, mapped onto this model:

```
maximize Z = 3 x1 + 5 x2
  x1        ≤ 4     (plant 1)
       2 x2 ≤ 12    (plant 2)
  3 x1 + 2 x2 ≤ 18  (plant 3)
```

The corner points are (0,0)=0, (4,0)=12, (4,3)=27, (2,6)=36 and (0,6)=30, so the optimum is **x = (2, 6), Z = 36**.

- **Slack**: plant 1 uses 2 of 4 hours, so its slack is 2 and it is **not binding**. Plants 2 and 3 have zero slack and are **binding**.
- **Shadow prices**: plant 1 = 0 (it has spare capacity), plant 2 = 1.5, plant 3 = 1. Check plant 2 by hand: with 13 hours, x2 = 6.5 and 3·x1 = 18 − 13, so x1 = 5/3 and Z = 5 + 32.5 = 37.5, exactly 1.5 more.
- **Range**: the plant 2 shadow price holds while its hours stay between 6 and 18. Past 18, product 1 drops out of the plan and plant 2 stops being the limit.

`tests/test_solver.py` and `tests/test_sensitivity.py` assert all of these values.

### What the sample data shows

With the synthetic Juniper Oak data (2,800 labor hours, 1,100 machine hours, $95,000 material budget), the optimal plan earns **$134,524** per month. Labor and material are both binding: an extra labor hour is worth about **$21.60** (valid from about 2,723 to 3,223 hours), and an extra $1,000 of material budget about **$767** (valid from about $89,617 to $100,768). Machine time has about 239 idle hours, so its shadow price is $0. The Nightstand is not produced; its price would need to rise by about $7.29 before it enters the plan. These numbers are produced by the app at run time, not stored anywhere.

## Architecture

```
operations-optimization-analysis/
├── app.py                  Streamlit entry point; registers pages with st.navigation
├── app_pages/              One file per page (UI only)
│   ├── dashboard.py  optimizer.py  sensitivity.py  scenarios.py
│   └── goal_seek.py  data_manager.py  sql_reports.py  about.py
├── optimizer/              Pure Python, no Streamlit imports
│   ├── model.py            Product, Resources, ProductionProblem; builds c, A_ub, b_ub, bounds
│   ├── validation.py       Checks product tables and resource settings
│   ├── solver.py           linprog wrapper, sign conversion, infeasible/unbounded diagnosis
│   ├── sensitivity.py      Ranges by bisection, sweeps, tornado
│   ├── goal_seek.py        brentq over re-solves, unreachable-target explanations
│   ├── parameters.py       A uniform handle on any single input
│   └── recommendations.py  Plain-English text built from solver output
├── data/                   Storage and files, no Streamlit imports
│   ├── database.py         SQLite schema, datasets, scenarios, runs, seeding
│   ├── queries.py          Parameterized SQL reports
│   ├── files.py            Upload parsing and CSV/Excel export
│   ├── analytics.py        History summaries for the dashboard
│   └── sample_data.py      The synthetic dataset and the seeded history builder
├── ui/                     Shared Streamlit helpers (state, caching, tables) and Plotly chart builders
├── sample_data/            products.csv, resources.csv, production_history.csv, sample_dataset.xlsx,
│                           invalid_products_example.csv
├── scripts/build_sample_data.py
├── tests/                  pytest + Streamlit AppTest
└── docs/WALKTHROUGH.md     End-to-end walkthrough and interview questions
```

This app lives in the `apps/operations-optimization-analysis/` folder of the
[`enobot/nate`](https://github.com/enobot/nate) repository (Nate's portfolio). Two files sit at
the repository root because Streamlit and GitHub require them there:

- `.streamlit/config.toml`: dark theme, upload limit, usage statistics off. Streamlit reads its
  config from the folder `streamlit run` starts in, and Streamlit Community Cloud always starts
  in the repository root.
- `.github/workflows/ops-app.yml`: runs the tests whenever this folder changes.

The page scripts live in `app_pages/` instead of `pages/` on purpose: Streamlit treats a folder named `pages/` as its older automatic multipage mode, and this app uses `st.navigation` instead, so the two are kept apart.

Data flow for one interaction: the page reads the working inputs from `st.session_state` → builds a `ProductionProblem` → `optimizer.solver.solve()` (cached by the problem's JSON) → tables, charts, and recommendations. Saving a scenario writes the inputs and the solved result to SQLite in one transaction.

### Database tables

| Table | Holds |
|---|---|
| `datasets`, `dataset_products` | Uploaded or sample datasets (resource settings + product rows) |
| `scenarios`, `scenario_products` | A full copy of the inputs for each saved scenario |
| `optimization_runs` | One row per solve of a scenario: status, total contribution, solver message, diagnosis |
| `run_products`, `run_constraints` | The plan and the constraint results (used, slack, shadow price, binding) for each run |
| `production_history` | The synthetic 12-month history |

Foreign keys cascade on delete, and CHECK constraints reject negative values at the database level as a second check behind the app's validation.

## Setup

Requirements: Python 3.13 (other versions were not tested).

Windows (PowerShell), from the root of the `nate` repository:

```powershell
python -m venv apps\operations-optimization-analysis\.venv
.\apps\operations-optimization-analysis\.venv\Scripts\Activate.ps1
python -m pip install -r apps\operations-optimization-analysis\requirements.txt
```

macOS / Linux, from the root of the `nate` repository:

```bash
python3.13 -m venv apps/operations-optimization-analysis/.venv
source apps/operations-optimization-analysis/.venv/bin/activate
python -m pip install -r apps/operations-optimization-analysis/requirements.txt
```

Run the app **from the repository root** (the same way Streamlit Community Cloud runs it, so
the theme in `.streamlit/config.toml` is picked up):

```bash
streamlit run apps/operations-optimization-analysis/app.py
```

Then open http://localhost:8501. To use a different port, add `--server.port 8611`.

Run the tests from the app's folder:

```bash
cd apps/operations-optimization-analysis
python -m pytest
```

On first run the app creates `instance/operations.db` and loads the synthetic sample data plus three example scenarios. Delete that file to start over. To put the database somewhere else, set the `OOA_DB_PATH` environment variable to a file path.

To rebuild the sample files (same output every time, because the history uses a fixed seed):

```bash
python scripts/build_sample_data.py
```

## Usage

1. **Dashboard**: see the current optimal plan and how it compares with the recent production mix.
2. **Optimizer**: change an input (for example labor hours to 3,000), click **Apply changes and solve**, and read the Recommendations tab. The Constraints tab shows each shadow price next to an actual +1 re-solve.
3. **Sensitivity**: pick an input and a range to see contribution, product mix, and shadow prices across it. The Ranges tab lists where each shadow price holds.
4. **Scenarios**: create a what-if (for example "Material prices +8%"), then compare it with the baseline.
5. **Goal Seek**: pick an input and a target contribution, then click **Run Goal Seek**.
6. **Data & Files**: upload your own CSV or Excel file. Try `sample_data/invalid_products_example.csv` to see the validation messages.
7. **SQL Reports**: pick a report, change its parameters, and read the SQL that produced the table.

### Upload format

CSV or Excel (`.xlsx`, sheet `products`, optional sheet `resources` with columns `parameter`, `value`):

| Column | Required | Notes |
|---|---|---|
| `product_id` | yes | letters, digits, `-` or `_`, max 20 characters, unique |
| `product_name` | yes | max 60 characters, starts with a letter or digit |
| `unit_price`, `material_cost`, `other_variable_cost` | yes | dollars per unit, ≥ 0 |
| `labor_hours`, `machine_hours` | yes | hours per unit, ≥ 0 |
| `min_units` | no | default 0 |
| `max_units` | no | blank means no demand cap; must be ≥ `min_units` |

Limits: 2 MB per file, 100 products, and a workbook may not expand past 20 MB when unzipped.

## Implementation details

- **Sign conventions** are handled in one place (`optimizer/solver.py`), and tests check them against the raw HiGHS output.
- **Ranges without a ranging report.** `linprog` returns duals but not Excel's allowable increase/decrease. Optimal contribution is a concave, piecewise-linear function of a resource amount, so the set of amounts where `Z(b) = Z(b0) + y·(b − b0)` is an interval; `optimizer/sensitivity.py` finds its ends by bisection over re-solves. Price ranges work the same way using the test "the current plan is still optimal". The results are accurate to a small tolerance, not exact.
- **Goal Seek** relies on the fact that optimal contribution is continuous and monotone in each supported input, so a sign change of `Z(v) − target` over the search range guarantees a root for `brentq`. If one end of the range is infeasible, the app first bisects for the feasibility boundary. For capacity inputs, the unreachable-target message includes the exact ceiling, computed by solving with that constraint removed.
- **Infeasibility diagnosis** is exact for this model: all usage coefficients are non-negative, so the model is feasible only if making exactly the minimum commitments fits within every resource.
- **Caching.** Solves and ranges are cached with `st.cache_data`, keyed by the problem's JSON, so switching pages does not re-solve.
- **Security.** All SQL uses bound parameters. Names are restricted to a plain character set that blocks spreadsheet formulas and Markdown tricks, exported text cells that start with `= + - @` are prefixed with `'`, uploads are size-limited and zip-size checked, and text shown through Markdown is escaped (including `$`, which Streamlit would otherwise read as math). There are no secrets, accounts, or external services, and usage statistics are turned off in `.streamlit/config.toml`.

## Testing

```bash
python -m pytest            # everything (127 tests at the time of writing)
python -m pytest tests/test_solver.py -v
python -m pytest tests/test_app.py -v    # headless UI tests only
```

| File | What it covers |
|---|---|
| `test_solver.py` | Textbook optimum by corner points, shadow prices and their signs, +1 re-solve checks, demand-cap and minimum-commitment duals, infeasible and unbounded detection, the whole-unit MILP against hand enumeration |
| `test_sensitivity.py` | Textbook right-hand-side and price ranges, consistency with re-solves on the sample data, sweeps, tornado |
| `test_goal_seek.py` | Hand-computed Goal Seek answers, cost inputs, unreachable targets with ceilings, infeasible search ranges |
| `test_validation.py` | Missing columns, bad numbers, negatives, duplicates, min > max, formula-like names, blank rows, resource rules |
| `test_files.py` | CSV/Excel uploads, oversized and zip-bomb files, Excel and CSV export round trips, formula neutralization |
| `test_database.py` | SQLite round trips on temporary databases, name rules, CHECK and cascade behavior, rollback, every SQL report, parameter validation |
| `test_sample_data_and_analytics.py` | Sample files match the code that builds them, history analytics, recommendation text, chart builders |
| `test_app.py` | Streamlit `AppTest`: every page renders, the Optimizer re-solves after a form submit, infeasible messages, Goal Seek, saving a what-if, uploading good and bad files, SQL reports |

The app was also started with `streamlit run app.py --server.headless true --server.port 8611`, and `http://localhost:8611/_stcore/health` returned `ok`. CI runs the same pytest command whenever this folder changes (`.github/workflows/ops-app.yml` at the repository root).

## Challenges this design solves

- **Max vs. min sign conventions.** HiGHS reports derivatives of the minimized objective, so every dual has the opposite sign from the maximization shadow price. Getting this wrong silently produces negative "values" for scarce resources; the tests pin it down.
- **No ranging report.** Excel Solver prints allowable increases and decreases; `linprog` does not. Re-solving and bisecting recovers them, with the tolerance stated in the app.
- **Degenerate and fractional answers.** A binding constraint can have a $0 shadow price when another limit is reached at the same point, and LP plans can contain fractions. The recommendations call out both, and the whole-unit plan is shown next to the LP plan.
- **Explaining failure.** An "infeasible" status alone is not useful, so the app computes which minimum commitments overrun which resource. HiGHS can also label an infeasible model "unbounded" during presolve, so feasibility is checked first.
- **Untrusted files.** Uploads go through size limits, a zip expansion check, and cell-by-cell validation before anything is stored.
- **Streamlit state.** Widget state is cleared when you change pages, so the working inputs live in `st.session_state` and the table editor is re-keyed whenever new data is loaded.

## Deployment

### Streamlit Community Cloud

These steps follow the Streamlit docs (deploy page and app-dependencies page, checked November 2026). The deployment itself has **not** been done or tested yet.

1. Push this folder to a GitHub repository named `enobot/operations-optimization-analysis`.
2. Sign in at https://share.streamlit.io with GitHub and click **Create app**, then **Yup, I have an app**.
3. Fill in the repository (`enobot/operations-optimization-analysis`), branch (`main`), and main file path (`app.py`). Optionally pick a custom subdomain.
4. Open **Advanced settings**, choose **Python 3.13** in the **Python version** dropdown (the default is 3.12, and this project was only tested on 3.13), leave **Secrets** empty, and click **Save**.
5. Deploy the app from the same form. Community Cloud reads `requirements.txt` from the repository root (it looks next to the entrypoint first, then the root) and installs those exact versions; the first build can take a few minutes.
6. Open the app URL and check that the Dashboard loads with the "Synthetic data" label.

**Storage on Community Cloud is temporary.** Streamlit's docs say Community Cloud apps do not guarantee the persistence of local file storage. The SQLite file is created on the app's local disk, so uploaded datasets, saved scenarios, and runs can disappear whenever the app restarts, redeploys, or wakes from sleep (apps without traffic for 12 hours go to sleep). On every fresh start the app rebuilds the database from the bundled sample files, so the demo always works, but anything a visitor saved is lost. A permanent version would need an external database.

### Linking from the portfolio

After deploying, copy the app URL (for example `https://<your-subdomain>.streamlit.app`) and:

1. Replace the "Live demo" line at the top of this README with the URL.
2. On the portfolio site, add a project card with two links: **Live demo** → the Streamlit URL, **Source code** → https://github.com/enobot/operations-optimization-analysis.
3. Optionally add the demo URL to the repository's GitHub "About" section (Website field).

## What's next

- An external database (for example PostgreSQL) so saved scenarios survive restarts on the hosted demo.
- Multi-period planning with inventory carried between months.
- A side-by-side check against the original Excel Solver workbook's answer report.
- Browser-level end-to-end tests and an accessibility review of the charts.

## License and credits

MIT License. Copyright (c) 2026 Nathanael Haig and Tracy Tran. See [LICENSE](LICENSE).

Built by Nathanael Haig and Tracy Tran, as an expanded portfolio rebuild of Nathanael Haig's Excel coursework project. Nathanael Haig is an Information Systems student at Cal State Fullerton (expected May 2027).

The Wyndor Glass example used in the tests is the standard introductory LP from Hillier & Lieberman, *Introduction to Operations Research*; only its well-known numbers are used.
