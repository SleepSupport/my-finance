import { el, formatMoney, formatDate, formatMonthAxis, currencySelect, showToast, confirmDialog } from "../ui.js";
import { generateId } from "../storage.js";
import { LineChart } from "../charts.js";
import { sortableHeader, sortRows, renderFilterBar, applyCommonFilters } from "../table-controls.js";
import { monthlyTotalsByCurrency, sumByCurrency } from "../calculators.js";

let tableFilter = { currency: "all", search: "", dateFrom: "", dateTo: "" };
let tableSort = { key: "date", dir: "desc" };

export function renderSalary(container, ctx) {
  const { state, persist, registerChart, currencies } = ctx;

  const form = el("form", { class: "form", id: "salary-form" }, [
    el("div", { class: "form-row" }, [
      el("label", {}, ["Дата", el("input", { class: "input", name: "date", type: "date", value: new Date().toISOString().slice(0, 10), required: "required" })]),
      el("label", {}, ["Валюта", currencySelect(currencies, "BYN")]),
      el("label", {}, ["Сумма", el("input", { class: "input", name: "amount", type: "number", min: "0", step: "0.01", required: "required" })]),
    ]),
    el("label", {}, ["Источник дохода", el("input", { class: "input", name: "source", placeholder: "Напр. Основная работа, подработка" })]),
    el("label", {}, ["Заметка", el("input", { class: "input", name: "note", placeholder: "Необязательно" })]),
    el("button", { class: "btn btn-primary", type: "submit" }, "Добавить доход"),
  ]);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    state.salary.push({
      id: generateId(),
      date: data.get("date"),
      currency: data.get("currency"),
      amount: parseFloat(data.get("amount")),
      source: data.get("source").trim(),
      note: data.get("note").trim(),
    });
    persist();
    showToast("Доход добавлен");
    ctx.rerender();
  });
  const formCard = el("div", { class: "card" }, [el("h2", {}, "Добавить доход"), form]);

  const totalsCard = el("div", { class: "card" }, [el("h2", {}, "Всего за всё время")]);
  const totals = sumByCurrency(state.salary);
  if (!totals.size) {
    totalsCard.appendChild(el("p", { class: "muted" }, "Пока нет записей о доходах."));
  } else {
    for (const [currency, sum] of totals) {
      totalsCard.appendChild(el("div", { class: "stat" }, [el("span", { class: "stat-value" }, formatMoney(sum, currency)), el("span", { class: "muted small" }, currency)]));
    }
  }

  const tableCard = el("div", { class: "card span-2" }, [el("h2", {}, "История доходов")]);
  let visibleSalary = state.salary;
  if (!state.salary.length) {
    tableCard.appendChild(el("p", { class: "muted" }, "Пока нет записей — добавьте первую слева."));
  } else {
    const usedCurrencies = [...new Set(state.salary.map((s) => s.currency))];
    renderFilterBar(tableCard, {
      state: tableFilter,
      currencies: usedCurrencies,
      onChange: ctx.rerender,
      searchPlaceholder: "Источник, заметка…",
      showDateRange: true,
    });

    visibleSalary = applyCommonFilters(state.salary, tableFilter, {
      currencyOf: (s) => s.currency,
      dateOf: (s) => s.date,
      searchableText: (s) => `${s.source || ""} ${s.note || ""}`,
    });

    if (!visibleSalary.length) {
      tableCard.appendChild(el("p", { class: "muted" }, "Нет записей по заданным фильтрам."));
    } else {
      const accessors = {
        date: (s) => new Date(s.date).getTime(),
        source: (s) => (s.source || "").toLowerCase(),
        amount: (s) => s.amount,
      };
      const sorted = sortRows(visibleSalary, tableSort, accessors);
      const table = el("table", { class: "table" }, [
        el(
          "thead",
          {},
          el("tr", {}, [
            sortableHeader("Дата", "date", tableSort, ctx.rerender),
            sortableHeader("Источник", "source", tableSort, ctx.rerender),
            sortableHeader("Сумма", "amount", tableSort, ctx.rerender),
            el("th", {}, ""),
          ])
        ),
      ]);
      const tbody = el("tbody");
      for (const s of sorted) {
        tbody.appendChild(
          el("tr", {}, [
            el("td", {}, formatDate(s.date)),
            el("td", {}, [s.source || "—", s.note ? el("div", { class: "muted small" }, s.note) : null]),
            el("td", {}, formatMoney(s.amount, s.currency)),
            el(
              "td",
              { class: "table-actions" },
              el(
                "button",
                {
                  class: "btn btn-small btn-danger",
                  type: "button",
                  onClick: () => {
                    if (!confirmDialog("Удалить запись о доходе?")) return;
                    state.salary = state.salary.filter((x) => x.id !== s.id);
                    persist();
                    ctx.rerender();
                  },
                },
                "Удалить"
              )
            ),
          ])
        );
      }
      table.appendChild(tbody);
      tableCard.appendChild(el("div", { class: "table-scroll" }, [table]));
    }
  }

  const chartCard = el("div", { class: "card span-2" }, [el("h2", {}, "Доходы по месяцам")]);
  const chartHost = el("div");
  chartCard.appendChild(chartHost);
  const chart = new LineChart(chartHost, {
    formatY: (v) => Math.round(v).toLocaleString("ru-RU"),
    formatX: formatMonthAxis,
    emptyMessage: "Добавьте доходы, чтобы увидеть график",
  });
  registerChart(chart);
  const monthly = monthlyTotalsByCurrency(visibleSalary);
  chart.setSeries([...monthly.entries()].map(([currency, points]) => ({ id: currency, label: currency, points })));

  container.appendChild(el("div", { class: "view-grid" }, [formCard, totalsCard, tableCard, chartCard]));
}
