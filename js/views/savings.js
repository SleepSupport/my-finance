import { el, formatMoney, formatDate, formatMonthAxis, currencySelect, showToast, confirmDialog } from "../ui.js";
import { generateId } from "../storage.js";
import { LineChart } from "../charts.js";
import { sortableHeader, sortRows, renderFilterBar, applyCommonFilters } from "../table-controls.js";
import { savingsGoalProgress } from "../calculators.js";

let selectedGoalId = null;
let tableFilter = { currency: "all", search: "" };
let tableSort = { key: "name", dir: "asc" };

export function savingsAggregateSeries(goals) {
  const byCurrency = new Map();
  for (const g of goals) {
    for (const e of g.entries || []) {
      if (!byCurrency.has(g.currency)) byCurrency.set(g.currency, []);
      byCurrency.get(g.currency).push(e);
    }
  }
  const series = [];
  for (const [currency, list] of byCurrency) {
    const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    const points = sorted.map((e) => {
      running += e.amount;
      return { x: new Date(e.date).getTime(), y: running };
    });
    series.push({ id: currency, label: currency, points });
  }
  return series;
}

export function renderSavings(container, ctx) {
  const { state, persist, registerChart, currencies } = ctx;

  const goalForm = el("form", { class: "form", id: "goal-form" }, [
    el("label", {}, ["Название цели", el("input", { class: "input", name: "name", required: "required", placeholder: "Напр. Подушка безопасности" })]),
    el("div", { class: "form-row" }, [
      el("label", {}, ["Валюта", currencySelect(currencies, "BYN")]),
      el("label", {}, ["Целевая сумма", el("input", { class: "input", name: "targetAmount", type: "number", min: "0", step: "0.01", required: "required" })]),
    ]),
    el("button", { class: "btn btn-primary", type: "submit" }, "Создать цель"),
  ]);
  goalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(goalForm);
    state.savingsGoals.push({
      id: generateId(),
      name: data.get("name").trim(),
      currency: data.get("currency"),
      targetAmount: parseFloat(data.get("targetAmount")),
      entries: [],
    });
    persist();
    showToast("Цель создана");
    ctx.rerender();
  });
  const formCard = el("div", { class: "card" }, [el("h2", {}, "Новая цель накопления"), goalForm]);

  // --- Add contribution ---
  const contribCard = el("div", { class: "card" });
  contribCard.appendChild(el("h2", {}, "Пополнить цель"));
  if (!state.savingsGoals.length) {
    contribCard.appendChild(el("p", { class: "muted" }, "Сначала создайте цель."));
  } else {
    const contribForm = el("form", { class: "form", id: "contrib-form" }, [
      el("label", {}, [
        "Цель",
        el(
          "select",
          { class: "input", name: "goalId" },
          state.savingsGoals.map((g) => el("option", { value: g.id }, `${g.name} (${g.currency})`))
        ),
      ]),
      el("div", { class: "form-row" }, [
        el("label", {}, ["Сумма", el("input", { class: "input", name: "amount", type: "number", step: "0.01", required: "required" })]),
        el("label", {}, ["Дата", el("input", { class: "input", name: "date", type: "date", value: new Date().toISOString().slice(0, 10), required: "required" })]),
      ]),
      el("label", {}, ["Заметка", el("input", { class: "input", name: "note", placeholder: "Необязательно" })]),
      el("button", { class: "btn btn-primary", type: "submit" }, "Добавить пополнение"),
      el("p", { class: "muted small" }, "Отрицательная сумма спишет средства (снятие)."),
    ]);
    contribForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(contribForm);
      const goal = state.savingsGoals.find((g) => g.id === data.get("goalId"));
      if (!goal) return;
      goal.entries.push({
        id: generateId(),
        amount: parseFloat(data.get("amount")),
        date: data.get("date"),
        note: data.get("note").trim(),
      });
      persist();
      showToast("Пополнение добавлено");
      ctx.rerender();
    });
    contribCard.appendChild(contribForm);
  }

  // --- Table ---
  const tableCard = el("div", { class: "card span-2" }, [el("h2", {}, "Мои цели")]);
  if (!state.savingsGoals.length) {
    tableCard.appendChild(el("p", { class: "muted" }, "Пока нет целей накопления."));
  } else {
    const usedCurrencies = [...new Set(state.savingsGoals.map((g) => g.currency))];
    renderFilterBar(tableCard, {
      state: tableFilter,
      currencies: usedCurrencies,
      onChange: ctx.rerender,
      searchPlaceholder: "Название цели…",
    });

    const filtered = applyCommonFilters(state.savingsGoals, tableFilter, {
      currencyOf: (g) => g.currency,
      searchableText: (g) => g.name,
    });

    if (!filtered.length) {
      tableCard.appendChild(el("p", { class: "muted" }, "Нет целей по заданным фильтрам."));
    } else {
    const accessors = {
      name: (g) => g.name.toLowerCase(),
      currency: (g) => g.currency,
      total: (g) => savingsGoalProgress(g).total,
      target: (g) => g.targetAmount,
      percent: (g) => savingsGoalProgress(g).percent,
    };
    const sorted = sortRows(filtered, tableSort, accessors);
    const table = el("table", { class: "table" }, [
      el(
        "thead",
        {},
        el("tr", {}, [
          sortableHeader("Цель", "name", tableSort, ctx.rerender),
          sortableHeader("Накоплено", "total", tableSort, ctx.rerender),
          sortableHeader("Прогресс", "percent", tableSort, ctx.rerender),
          el("th", {}, ""),
        ])
      ),
    ]);
    const tbody = el("tbody");
    for (const g of sorted) {
      const progress = savingsGoalProgress(g);
      const row = el("tr", { class: g.id === selectedGoalId ? "is-selected" : "" }, [
        el("td", {}, [el("strong", {}, g.name), el("div", { class: "muted small" }, g.currency)]),
        el("td", {}, `${formatMoney(progress.total, g.currency)} из ${formatMoney(progress.target, g.currency)}`),
        el("td", {}, [
          el("div", { class: "progress-bar" }, [el("div", { class: "progress-bar-fill", style: `width:${progress.percent.toFixed(0)}%` })]),
          el("span", { class: "muted small" }, `${progress.percent.toFixed(0)}%`),
        ]),
        el("td", { class: "table-actions" }, [
          el(
            "button",
            {
              class: "btn btn-small",
              type: "button",
              onClick: () => {
                selectedGoalId = selectedGoalId === g.id ? null : g.id;
                ctx.rerender();
              },
            },
            selectedGoalId === g.id ? "Скрыть график" : "График"
          ),
          el(
            "button",
            {
              class: "btn btn-small btn-danger",
              type: "button",
              onClick: () => {
                if (!confirmDialog(`Удалить цель «${g.name}» вместе со всеми пополнениями?`)) return;
                state.savingsGoals = state.savingsGoals.filter((x) => x.id !== g.id);
                if (selectedGoalId === g.id) selectedGoalId = null;
                persist();
                ctx.rerender();
              },
            },
            "Удалить"
          ),
        ]),
      ]);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    tableCard.appendChild(el("div", { class: "table-scroll" }, [table]));
    }
  }

  // --- Chart ---
  const selectedGoal = state.savingsGoals.find((g) => g.id === selectedGoalId);
  const chartCard = el("div", { class: "card span-2" }, [
    el("h2", {}, selectedGoal ? `График: ${selectedGoal.name}` : "Общий график накоплений"),
  ]);
  const chartHost = el("div");
  chartCard.appendChild(chartHost);
  const chart = new LineChart(chartHost, {
    formatY: (v) => Math.round(v).toLocaleString("ru-RU"),
    formatX: formatMonthAxis,
    emptyMessage: "Добавьте пополнения, чтобы увидеть график",
  });
  registerChart(chart);
  if (selectedGoal) {
    chart.setSeries([{ id: selectedGoal.id, label: selectedGoal.currency, points: savingsGoalProgress(selectedGoal).points }]);
  } else {
    chart.setSeries(savingsAggregateSeries(state.savingsGoals));
  }

  container.appendChild(el("div", { class: "view-grid" }, [formCard, contribCard, tableCard, chartCard]));
}
