"""Data & Files: upload CSV/Excel datasets, manage stored datasets, download templates and exports."""

from __future__ import annotations

import sqlite3

import streamlit as st

from data import database as db
from data.files import MAX_UPLOAD_BYTES, dataset_to_excel_bytes, frame_to_csv_bytes, parse_upload
from data.sample_data import SAMPLE_DIR
from optimizer.model import PRODUCT_COLUMNS, PRODUCT_FIELD_LABELS
from ui import components, state

st.title("Data and files")
st.caption("Upload a product dataset, switch between stored datasets, and download templates or exports.")
components.data_notice()

if flash := st.session_state.pop("data_flash", None):
    st.toast(flash)

path = state.db_path()
w = state.working()

tab_upload, tab_stored, tab_download = st.tabs(["Upload", "Stored datasets", "Downloads and templates"])

with tab_upload:
    st.markdown(
        "Upload a **.csv** with one row per product, or an **.xlsx** workbook with a `products` sheet and "
        "an optional `resources` sheet (columns `parameter`, `value`). Files are limited to "
        f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB and 100 products."
    )
    with st.expander("Required columns"):
        st.dataframe(
            [{"column": c, "meaning": PRODUCT_FIELD_LABELS[c],
              "required": "yes" if c not in ("min_units", "max_units") else "no (defaults: 0 / no cap)"}
             for c in PRODUCT_COLUMNS],
            hide_index=True,
        )
        st.caption("All numbers must be plain, non-negative values (no $ signs or thousands separators).")
    uploaded = st.file_uploader("Choose a file", type=["csv", "xlsx"], max_upload_size=2, key="upload_file")
    if uploaded is not None:
        parsed = parse_upload(uploaded.name, uploaded.getvalue())
        for note in parsed.warnings:
            st.warning(note)
        if not parsed.ok:
            st.error("The file was not accepted. Fix these problems and upload it again:")
            st.markdown("\n".join(f"- {components.escape_md(e)}" for e in parsed.errors))
        else:
            st.success(f"{len(parsed.products)} products passed validation.")
            st.dataframe(parsed.products, hide_index=True)
            if parsed.resources is None:
                st.info("No resources sheet was found, so the current working resource settings will be used.")
                resources = w["resources"]
            else:
                st.caption("Resource settings from the workbook:")
                st.dataframe([parsed.resources.as_dict()], hide_index=True)
                resources = parsed.resources
            with st.form("save_upload"):
                default_name = uploaded.name.rsplit(".", 1)[0][:60]
                name = st.text_input("Dataset name", value=default_name, max_chars=60)
                synthetic = st.checkbox(
                    "This file contains synthetic (made-up) data", value=False,
                    help="Shown as a label on every page while this dataset is in use.",
                )
                save = st.form_submit_button("Save to database and use it", type="primary", icon=":material/save:")
            if save:
                try:
                    dataset_id = db.save_dataset(path, name, parsed.products, resources,
                                                 source="upload", is_synthetic=synthetic)
                except db.StorageError as exc:
                    st.error(str(exc))
                except sqlite3.Error as exc:
                    st.error(f"Database error while saving ({type(exc).__name__}). Nothing was saved.")
                else:
                    state.load_dataset(dataset_id)
                    st.session_state["data_flash"] = f"Saved dataset #{dataset_id} and loaded it."
                    st.rerun()

with tab_stored:
    datasets = db.list_datasets(path)
    st.dataframe(
        datasets,
        hide_index=True,
        column_config={
            "dataset_id": st.column_config.NumberColumn("ID", format="%d"),
            "name": "Name",
            "source": "Source",
            "is_synthetic": st.column_config.CheckboxColumn("Synthetic"),
            "created_at": "Created (UTC)",
            "products": st.column_config.NumberColumn("Products", format="%d"),
        },
    )
    names = dict(zip(datasets["dataset_id"].astype(int), datasets["name"]))
    if st.session_state.get("dataset_pick") not in names:
        st.session_state.pop("dataset_pick", None)
    pick = st.selectbox("Dataset", list(names), format_func=names.get, key="dataset_pick")
    s1, s2 = st.columns(2)
    if s1.button("Load as working data", icon=":material/input:"):
        state.load_dataset(int(pick))
        st.session_state["data_flash"] = f"Loaded '{names[int(pick)]}'."
        st.rerun()
    source = datasets.loc[datasets["dataset_id"] == pick, "source"].iloc[0]
    if source == "sample":
        s2.caption("The built-in sample dataset cannot be deleted.")
    else:
        with s2.popover("Delete dataset", icon=":material/delete:"):
            st.write(f"Delete '{names[int(pick)]}'? Saved scenarios keep their own copy of the inputs.")
            if st.button("Yes, delete it", type="primary", key="confirm_delete_dataset"):
                try:
                    db.delete_dataset(path, int(pick))
                except db.StorageError as exc:
                    st.error(str(exc))
                else:
                    if w["dataset_id"] == int(pick):
                        state.load_dataset(db.sample_dataset_id(path))
                    st.session_state["data_flash"] = "Dataset deleted."
                    st.rerun()

with tab_download:
    st.subheader("Working data")
    st.caption(f"Currently loaded: {components.escape_md(w['label'])}")
    d1, d2 = st.columns(2)
    d1.download_button("Products (CSV)", frame_to_csv_bytes(w["products"]), file_name="products.csv",
                       mime="text/csv", icon=":material/download:")
    d2.download_button(
        "Products + resources (Excel)", dataset_to_excel_bytes(w["products"], w["resources"]),
        file_name="dataset.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        icon=":material/download:",
    )
    st.subheader("Sample files (synthetic data)")
    files = [
        ("sample_dataset.xlsx", "Sample workbook (products, resources, history)",
         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("products.csv", "Sample products (CSV)", "text/csv"),
        ("production_history.csv", "Synthetic 12-month history (CSV)", "text/csv"),
        ("invalid_products_example.csv", "File with deliberate errors, to try the validator", "text/csv"),
    ]
    for filename, label, mime in files:
        file_path = SAMPLE_DIR / filename
        if file_path.exists():
            st.download_button(label, file_path.read_bytes(), file_name=filename, mime=mime,
                               key=f"dl_{filename}", icon=":material/download:")
