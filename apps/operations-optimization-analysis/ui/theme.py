"""Colors and Plotly layout defaults shared by every chart.

The categorical colors are a fixed, ordered palette checked for color-vision
deficiency separation and 3:1 contrast against the dark app background.
Colors are assigned to entities (a product keeps its color on every chart),
never to rank.
"""

from __future__ import annotations

import plotly.graph_objects as go

BACKGROUND = "#151514"
SURFACE = "#1f1f1d"
TEXT = "#f0efec"
TEXT_MUTED = "#c3c2b7"
GRID = "#33332f"
PRIMARY = "#3987e5"

CATEGORICAL = [
    "#3987e5",  # blue
    "#d95926",  # orange
    "#199e70",  # aqua
    "#c98500",  # yellow
    "#d55181",  # magenta
    "#0ca30c",  # green
    "#9085e9",  # violet
    "#e66767",  # red
]
OTHER = "#8a8984"  # for items beyond the eighth slot


def color_map(keys: list[str]) -> dict[str, str]:
    """Stable entity -> color mapping in the given (dataset) order."""
    return {key: (CATEGORICAL[i] if i < len(CATEGORICAL) else OTHER) for i, key in enumerate(keys)}


def _shows_legend(fig: go.Figure) -> bool:
    """Plotly draws a legend when more than one trace is listed in it (or when forced)."""
    if fig.layout.showlegend is not None:
        return bool(fig.layout.showlegend)
    return sum(1 for trace in fig.data if trace.showlegend is not False) > 1


def style(fig: go.Figure, *, height: int = 360, title: str | None = None) -> go.Figure:
    # The title sits at the top of the figure and the legend sits just above the
    # plot area, so the top margin must leave room for both without overlap.
    top_margin = 16 + (36 if title else 0) + (30 if _shows_legend(fig) else 0)
    fig.update_layout(
        template="plotly_dark",
        height=height,
        title=dict(text=title, font=dict(size=15, color=TEXT), x=0, xanchor="left",
                   yref="container", y=1, yanchor="top", pad=dict(t=8)) if title else None,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="sans-serif", size=13, color=TEXT_MUTED),
        margin=dict(l=10, r=10, t=top_margin, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0, bgcolor="rgba(0,0,0,0)"),
        hoverlabel=dict(bgcolor=SURFACE, bordercolor=GRID, font=dict(color=TEXT)),
        barcornerradius=4,
        bargap=0.25,
    )
    fig.update_xaxes(gridcolor=GRID, zerolinecolor=GRID, linecolor=GRID)
    fig.update_yaxes(gridcolor=GRID, zerolinecolor=GRID, linecolor=GRID)
    return fig
