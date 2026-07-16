// Shared sort/filter building blocks used by every table view (deposits,
// savings, salary, expenses) so the four views don't reimplement the same
// column-sort and filter-bar logic four times.

import { el } from "./ui.js";

export function sortableHeader(label, key, sortState, onChange) {
  const isActive = sortState.key === key;
  const arrow = isActive ? (sortState.dir === "asc" ? " ▲" : " ▼") : "";
  return el(
    "th",
    {
      class: "sortable" + (isActive ? " is-sorted" : ""),
      onClick: () => {
        if (sortState.key === key) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState.key = key;
          sortState.dir = "asc";
        }
        onChange();
      },
    },
    label + arrow
  );
}

/** accessors: { [key]: (item) => comparable value } */
export function sortRows(items, sortState, accessors) {
  const accessor = accessors[sortState.key];
  if (!accessor) return items;
  const sorted = [...items].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  if (sortState.dir === "desc") sorted.reverse();
  return sorted;
}

/**
 * Renders a filter bar into `container` and returns nothing — it mutates
 * `state` in place and calls `onChange` after each edit, same pattern as the
 * rest of the app's re-render-the-whole-view approach.
 *
 * state shape: { currency: "all"|string, search: string, dateFrom: string, dateTo: string }
 */
export function renderFilterBar(container, { state, currencies, onChange, searchPlaceholder, showDateRange }) {
  const bar = el("div", { class: "filter-bar" });

  if (currencies && currencies.length > 1) {
    const chipRow = el("div", { class: "chip-row" }, [
      el(
        "button",
        {
          type: "button",
          class: "chip" + (state.currency === "all" ? " is-active" : ""),
          onClick: () => {
            state.currency = "all";
            onChange();
          },
        },
        "Все валюты"
      ),
      ...currencies.map((c) =>
        el(
          "button",
          {
            type: "button",
            class: "chip" + (state.currency === c ? " is-active" : ""),
            onClick: () => {
              state.currency = c;
              onChange();
            },
          },
          c
        )
      ),
    ]);
    bar.appendChild(chipRow);
  }

  const controlsRow = el("div", { class: "filter-controls" });

  const search = el("input", {
    class: "input",
    type: "search",
    placeholder: searchPlaceholder || "Поиск",
    value: state.search || "",
    onInput: (e) => {
      state.search = e.target.value;
      onChange();
    },
  });
  controlsRow.appendChild(el("label", { class: "filter-field" }, ["Поиск", search]));

  if (showDateRange) {
    const from = el("input", {
      class: "input",
      type: "date",
      value: state.dateFrom || "",
      onChange: (e) => {
        state.dateFrom = e.target.value;
        onChange();
      },
    });
    const to = el("input", {
      class: "input",
      type: "date",
      value: state.dateTo || "",
      onChange: (e) => {
        state.dateTo = e.target.value;
        onChange();
      },
    });
    controlsRow.appendChild(el("label", { class: "filter-field" }, ["С", from]));
    controlsRow.appendChild(el("label", { class: "filter-field" }, ["По", to]));
  }

  const hasActiveFilters =
    state.currency !== "all" || state.search || (showDateRange && (state.dateFrom || state.dateTo));
  if (hasActiveFilters) {
    controlsRow.appendChild(
      el(
        "button",
        {
          type: "button",
          class: "btn btn-small",
          onClick: () => {
            state.currency = "all";
            state.search = "";
            state.dateFrom = "";
            state.dateTo = "";
            onChange();
          },
        },
        "Сбросить фильтры"
      )
    );
  }

  bar.appendChild(controlsRow);
  container.appendChild(bar);
}

export function applyCommonFilters(items, state, { currencyOf, dateOf, searchableText }) {
  return items.filter((item) => {
    if (state.currency !== "all" && currencyOf(item) !== state.currency) return false;
    if (state.dateFrom && dateOf && new Date(dateOf(item)) < new Date(state.dateFrom)) return false;
    if (state.dateTo && dateOf && new Date(dateOf(item)) > new Date(state.dateTo)) return false;
    if (state.search && searchableText) {
      const haystack = searchableText(item).toLowerCase();
      if (!haystack.includes(state.search.toLowerCase())) return false;
    }
    return true;
  });
}
