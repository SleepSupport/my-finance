import { el, formatMoney, formatDate, formatMonthAxis, currencySelect, showToast, confirmDialog } from "../ui.js";
import { generateId } from "../storage.js";
import { LineChart } from "../charts.js";
import { monthlyTotalsByCurrency, sumByCurrency } from "../calculators.js";

let categoryFilter = "all";

export function renderExpenses(container, ctx) {
  const { state, persist, registerChart, currencies } = ctx;

  const form = el("form", { class: "form", id: "expense-form" }, [
    el("div", { class: "form-row" }, [
      el("label", {}, ["Дата", el("input", { class: "input", name: "date", type: "date", value: new Date().toISOString().slice(0, 10), required: "required" })]),
      el("label", {}, ["Валюта", currencySelect(currencies, "BYN")]),
      el("label", {}, ["Сумма", el("input", { class: "input", name: "amount", type: "number", min: "0", step: "0.01", required: "required" })]),
    ]),
    el("label", {}, [
      "Категория",
      el("input", { class: "input", name: "category", list: "category-options", required: "required", placeholder: "Выберите или введите новую" }),
      el("datalist", { id: "category-options" }, state.expenseCategories.map((c) => el("option", { value: c }))),
    ]),
    el("label", {}, ["Заметка", el("input", { class: "input", name: "note", placeholder: "Необязательно" })]),
    el("button", { class: "btn btn-primary", type: "submit" }, "Добавить трату"),
  ]);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const category = data.get("category").trim();
    if (category && !state.expenseCategories.includes(category)) {
      state.expenseCategories.push(category);
    }
    state.expenses.push({
      id: generateId(),
      date: data.get("date"),
      currency: data.get("currency"),
      amount: parseFloat(data.get("amount")),
      category,
      note: data.get("note").trim(),
    });
    persist();
    showToast("Трата добавлена");
    ctx.rerender();
  });
  const formCard = el("div", { class: "card" }, [el("h2", {}, "Добавить трату"), form]);

  // --- Category breakdown ---
  const breakdownCard = el("div", { class: "card" }, [el("h2", {}, "По категориям")]);
  if (!state.expenses.length) {
    breakdownCard.appendChild(el("p", { class: "muted" }, "Пока нет трат."));
  } else {
    const byCurrency = new Map();
    for (const e of state.expenses) {
      const key = e.currency;
      if (!byCurrency.has(key)) byCurrency.set(key, new Map());
      const catMap = byCurrency.get(key);
      catMap.set(e.category || "Без категории", (catMap.get(e.category || "Без категории") || 0) + e.amount);
    }
    for (const [currency, catMap] of byCurrency) {
      breakdownCard.appendChild(el("h3", { class: "subheading" }, currency));
      const max = Math.max(...catMap.values());
      const sorted = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
      for (const [category, sum] of sorted) {
        breakdownCard.appendChild(
          el("div", { class: "bar-row" }, [
            el("div", { class: "bar-row-label" }, [
              el(
                "button",
                {
                  type: "button",
                  class: "link-btn",
                  onClick: () => {
                    categoryFilter = categoryFilter === category ? "all" : category;
                    ctx.rerender();
                  },
                },
                category
              ),
              el("span", {}, formatMoney(sum, currency)),
            ]),
            el("div", { class: "progress-bar" }, [el("div", { class: "progress-bar-fill", style: `width:${((sum / max) * 100).toFixed(0)}%` })]),
          ])
        );
      }
    }
  }

  // --- Table ---
  const tableCard = el("div", { class: "card span-2" }, [
    el("h2", {}, "История трат" + (categoryFilter !== "all" ? ` — ${categoryFilter}` : "")),
  ]);
  if (categoryFilter !== "all") {
    tableCard.appendChild(
      el("button", { class: "chip is-active", type: "button", onClick: () => { categoryFilter = "all"; ctx.rerender(); } }, `${categoryFilter} ✕`)
    );
  }
  const visibleExpenses = state.expenses.filter((e) => categoryFilter === "all" || e.category === categoryFilter);
  if (!visibleExpenses.length) {
    tableCard.appendChild(el("p", { class: "muted" }, "Нет записей."));
  } else {
    const table = el("table", { class: "table" }, [el("thead", {}, el("tr", {}, ["Дата", "Категория", "Сумма", ""].map((h) => el("th", {}, h))))]);
    const tbody = el("tbody");
    for (const e of [...visibleExpenses].sort((a, b) => new Date(b.date) - new Date(a.date))) {
      tbody.appendChild(
        el("tr", {}, [
          el("td", {}, formatDate(e.date)),
          el("td", {}, [e.category || "—", e.note ? el("div", { class: "muted small" }, e.note) : null]),
          el("td", {}, formatMoney(e.amount, e.currency)),
          el(
            "td",
            { class: "table-actions" },
            el(
              "button",
              {
                class: "btn btn-small btn-danger",
                type: "button",
                onClick: () => {
                  if (!confirmDialog("Удалить трату?")) return;
                  state.expenses = state.expenses.filter((x) => x.id !== e.id);
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
    tableCard.appendChild(table);
  }

  const chartCard = el("div", { class: "card span-2" }, [el("h2", {}, "Траты по месяцам")]);
  const chartHost = el("div");
  chartCard.appendChild(chartHost);
  const chart = new LineChart(chartHost, {
    formatY: (v) => Math.round(v).toLocaleString("ru-RU"),
    formatX: formatMonthAxis,
    emptyMessage: "Добавьте траты, чтобы увидеть график",
  });
  registerChart(chart);
  const monthly = monthlyTotalsByCurrency(visibleExpenses.length ? visibleExpenses : state.expenses);
  chart.setSeries([...monthly.entries()].map(([currency, points]) => ({ id: currency, label: currency, points })));

  container.appendChild(el("div", { class: "view-grid" }, [formCard, breakdownCard, tableCard, chartCard]));
}
