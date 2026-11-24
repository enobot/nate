# Walkthrough

This document follows one request through the app from start to finish, explains the main design decisions, and ends with interview-style questions and short answers.

## 1. What happens when the app starts

1. `streamlit run app.py` runs `app.py` on every interaction (that is how Streamlit works: the script reruns top to bottom).
2. `ui.state.bootstrap()` runs once per browser session. It calls `data.database.init_db()`, which creates the SQLite tables with `CREATE TABLE IF NOT EXISTS` and, if the sample dataset is missing, loads `sample_data/products.csv`, `resources.csv`, and `production_history.csv`. The seeding check and inserts run inside one `BEGIN IMMEDIATE` transaction, so two sessions starting together cannot both seed. Three example scenarios are solved and saved at the same time, so the Scenarios page has something to compare.
3. The sample dataset becomes the session's **working data**: a product table and a `Resources` object stored in `st.session_state["working"]`. Every page analyzes this same working data.
4. `st.navigation` registers the eight pages in `app_pages/`, and the selected page runs.

## 2. One solve, step by step

Say you open the Optimizer, change labor hours from 2,800 to 3,000, and click **Apply changes and solve**.

1. **Validation.** The form values and the edited product table go to `optimizer.validation.build_problem()`. Each cell is checked (number, finite, not negative, not absurdly large), IDs must be unique, minimums cannot exceed caps, and names must use a plain character set. If anything fails, the app lists every problem with its row number and keeps the last valid inputs.
2. **Model building.** `optimizer.model.ProductionProblem` is an immutable dataclass. It computes each unit margin `m_i = price − (k·material + other + labor_hours·labor_rate + machine_hours·machine_rate)`, the 3 × n usage matrix `A_ub` (labor, machine, material dollars), the right-hand side `b_ub`, and the bounds `(min_units, max_units)`.
3. **Solving.** `optimizer.solver.solve()` calls `scipy.optimize.linprog(-m, A_ub, b_ub, bounds, method="highs")`. The minus sign turns "maximize profit" into "minimize negative profit".
4. **Translating the answer.** Status code 0 means optimal. Contribution is `-res.fun`. Shadow prices are `-res.ineqlin.marginals`. Bound duals give the value of one more unit of demand (`-res.upper.marginals`) and the cost of one more committed unit (`res.lower.marginals`). Slack is `b - A x`. A constraint is binding when its slack is within a relative tolerance of zero.
5. **When it fails.** Status 2 (infeasible) runs an exact check: since every coefficient is non-negative, the plan that makes only the minimum commitments uses the least of everything, so if that plan does not fit, the model is infeasible, and the app reports which resource is short and by how much. Status 3 (unbounded) lists products that are profitable, use no resources, and have no cap. Because HiGHS presolve can call an infeasible model "unbounded", the feasibility check runs first.
6. **Ranges.** `optimizer.sensitivity.rhs_ranges()` and `price_ranges()` re-solve the model many times (bisection) to find where each shadow price, and the current mix, stop holding.
7. **Recommendations.** `optimizer.recommendations.recommendations()` turns the numbers into sentences. Each sentence type needs specific numbers; if a number is missing, that sentence is skipped rather than guessed.
8. **Caching and display.** Solves are cached with `st.cache_data` keyed by the problem's JSON. The page draws Plotly charts and tables, and the Export tab builds CSV and Excel files on demand.

## 3. Key design decisions

| Decision | Why | Alternative considered |
|---|---|---|
| Keep `optimizer/` and `data/` free of Streamlit | The math and storage can be tested with plain pytest and reused from scripts | Putting logic in page files, which is quicker to write but hard to test |
| HiGHS through `linprog` | Maintained, fast, ships with SciPy, and returns dual values | PuLP or OR-Tools (extra dependency), or the legacy simplex methods (deprecated) |
| Ranges by bisection over re-solves | `linprog` has no ranging report; Z is concave and piecewise linear in a resource amount, so the valid set is an interval and bisection finds its ends | Reading the simplex basis directly, which `linprog` does not expose |
| Verify shadow prices with a +1 re-solve in the UI | Shows the dual value is real, and exposes degenerate cases where one-sided changes differ | Showing duals only |
| SQLite via the standard library | No server, one file, real SQL with foreign keys, CHECK constraints, and window functions | An external database (needed later for persistent hosting) |
| One connection per operation | Streamlit runs scripts on multiple threads; short-lived connections avoid sharing one across threads | A cached shared connection with `check_same_thread=False` and locking |
| Scenarios store a full copy of their inputs | A scenario still means the same thing if its source dataset is edited or deleted | Storing only differences from a dataset |
| Fixed-seed synthetic history | Reproducible demo data that tests can rebuild and compare | Random data on each run, or real company data (not available and not appropriate) |
| Pages in `app_pages/`, registered with `st.navigation` | Avoids Streamlit's older automatic `pages/` mode, and lets the app set titles, icons, and sections | The `pages/` folder convention |

## 4. Where to look in the code

| Question | File |
|---|---|
| How is the LP built? | `optimizer/model.py` (`usage_matrix`, `rhs`, `bounds`, `unit_margins`) |
| Where are signs flipped? | `optimizer/solver.py` (`solve`) |
| How are ranges found? | `optimizer/sensitivity.py` (`rhs_ranges`, `price_ranges`, `_search_up`, `_search_down`) |
| How does Goal Seek work? | `optimizer/goal_seek.py` |
| What does the database look like? | `data/database.py` (`SCHEMA`) |
| Which SQL reports exist? | `data/queries.py` (`REPORTS`) |
| How are uploads checked? | `data/files.py` (`parse_upload`) and `optimizer/validation.py` |

## 5. Interview questions and answers

**1. What is a shadow price?**
The change in the optimal objective from one more unit of a constrained resource, with everything else held fixed. In this app, a labor shadow price of $21.60 means one more labor hour would add about $21.60 of contribution. It only holds within a range; past that range another constraint takes over.

**2. What is the difference between a binding and a non-binding constraint?**
A binding constraint is fully used at the optimum (slack = 0), so it is limiting the answer. A non-binding constraint has slack left over, so a little more of it is worth nothing and its shadow price is 0. That is complementary slackness: for each constraint, either the slack or the shadow price is zero.

**3. Why does an LP optimum sit at a corner point?**
The feasible region is a polygon (polyhedron) defined by straight-line constraints, and the objective is linear, so moving in the improving direction always reaches the boundary and then a vertex. If an optimum exists, at least one vertex is optimal. The simplex method moves from vertex to vertex for this reason.

**4. What is the difference between infeasible and unbounded?**
Infeasible means no plan satisfies all the constraints at once, for example minimum orders that need more labor than exists. Unbounded means plans exist but profit can grow forever, which usually signals a missing constraint, like a profitable product with no demand cap that uses no resources.

**5. linprog minimizes. How do you maximize with it, and what does that do to the duals?**
Pass the negative of the profit coefficients and negate the result. The duals HiGHS returns are derivatives of the minimized objective, so the maximization shadow price is the negative of `res.ineqlin.marginals`. The tests check the sign against a textbook problem and a +1 re-solve.

**6. Why use parameterized SQL queries?**
The values are sent to the database separately from the SQL text, so input like `x'; DROP TABLE scenarios; --` is treated as data, not code. That prevents SQL injection, and it also handles quotes in normal names such as "O'Brien's plan". The app never builds SQL by pasting in user input.

**7. What is a reduced cost?**
For a product, its unit margin minus the shadow-price value of the resources one unit uses. A product that is not being made has a negative reduced cost; its price would have to rise by that amount before it enters the plan. The app uses this for the "Nightstand would need $7.29 more" recommendation, and a test re-solves at that price to confirm it.

**8. How did you get allowable increase/decrease without Excel's sensitivity report?**
Optimal profit as a function of one resource amount is concave and piecewise linear. The shadow price holds on the interval where profit still equals the straight-line prediction, so the app bisects for the ends of that interval by re-solving. It is accurate to a small tolerance, and the tests compare it with the textbook ranges.

**9. How does Goal Seek work here?**
It treats "optimal profit as a function of one input" as the function to solve. That function is continuous and moves in one direction as the input changes, so if the target lies between the values at the two ends of the search range, `scipy.optimize.brentq` finds the input that hits it. The result is re-solved to confirm the profit matches. If the target is out of reach, the app reports the best possible value, and for capacity inputs the exact ceiling with that limit removed.

**10. Why might an LP answer include fractional units, and what do you do about it?**
LPs allow continuous values. If whole units matter, solve an integer program (the app uses HiGHS's MILP mode through `linprog(integrality=...)`) and compare. Integer programs do not have shadow prices in the same sense, which is why the sensitivity analysis uses the LP.

**11. What does degeneracy look like in practice?**
A constraint can be binding with a shadow price of 0, or a shadow price can hold in one direction only, when more than the usual number of constraints meet at the optimal corner. The app's +1 re-solve column and the range tables make this visible instead of hiding it.

**12. How do you keep uploaded files from causing problems?**
Size limits before parsing, a check that an `.xlsx` is a real zip that does not expand too far, cell-by-cell validation with row numbers in the error messages, a restricted character set for names, and formula-safe exports. Invalid data is never written to the database, and the database's CHECK constraints are a second barrier.

**13. What happens to saved data on Streamlit Community Cloud?**
The SQLite file lives on the app's local disk, which Streamlit does not guarantee to keep. Restarts or redeploys can wipe saved scenarios and uploads. The app reseeds the sample data on start, so the demo still works. A production version would use a hosted database.

**14. How would this scale to many users?**
The solver is fast for this size (about 1 ms per solve here), so the limits are elsewhere: SQLite allows one writer at a time, and Streamlit keeps per-session state in server memory. The next steps would be a client-server database, caching shared results, and running several app instances behind a load balancer. That has not been tested; it is the expected path.

**15. How do you know the results are right?**
The tests solve textbook problems whose answers are worked out by hand in the test docstrings (corner points, duals, ranges, integer solutions), check every shadow price against an actual re-solve, and check that the stored SQL results add up to the solver's totals.
