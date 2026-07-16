import { el, formatMonthAxis } from "../ui.js";
import { LineChart } from "../charts.js";
import { monthlyTotalsByCurrency, depositCurrentValue } from "../calculators.js";
import { depositsAggregateSeries } from "./deposits.js";
import { savingsAggregateSeries } from "./savings.js";

let overviewCurrency = null;

function seriesForCurrency(series, currency) {
  const found = series.find((s) => s.id === currency);
  return found ? found.points : [];
}

export function renderOverview(container, ctx) {
  const { state, registerChart, currencies } = ctx;

  const usedCurrencies = new Set([
    ...state.deposits.map((d) => d.currency),
    ...state.savingsGoals.map((g) => g.currency),
    ...state.salary.map((s) => s.currency),
    ...state.expenses.map((e) => e.currency),
  ]);
  const available = currencies.filter((c) => usedCurrencies.has(c));
  if (!available.length) available.push(...currencies.slice(0, 1));
  if (!overviewCurrency || !available.includes(overviewCurrency)) overviewCurrency = available[0];

  const tabs = el(
    "div",
    { class: "chip-row" },
    available.map((c) =>
      el(
        "button",
        {
          type: "button",
          class: "chip" + (c === overviewCurrency ? " is-active" : ""),
          onClick: () => {
            overviewCurrency = c;
            ctx.rerender();
          },
        },
        c
      )
    )
  );

  const card = el("div", { class: "card span-2" }, [
    el("h2", {}, "Общий график сумм"),
    el("p", { class: "muted small" }, "Накопительным итогом: вклады — текущая стоимость с процентами, накопления и доходы — сумма пополнений, траты — сумма расходов."),
    tabs,
  ]);
  const chartHost = el("div");
  card.appendChild(chartHost);
  const chart = new LineChart(chartHost, {
    formatY: (v) => Math.round(v).toLocaleString("ru-RU"),
    formatX: formatMonthAxis,
    emptyMessage: "Добавьте данные в любом из разделов, чтобы увидеть общий график",
  });
  registerChart(chart);

  const depositsForCurrency = state.deposits.filter((d) => d.currency === overviewCurrency);
  const now = Date.now();
  // depositsAggregateSeries projects growth all the way to each deposit's term
  // end (useful on the Вклады tab), but "Итого" here should reflect today's
  // actual value, not a future projection — so clip the curve at now and
  // append the real current total as its last point.
  const depositsCurrentTotal = depositsForCurrency.reduce((sum, d) => sum + depositCurrentValue(d, new Date(now)), 0);
  const depositsPoints = seriesForCurrency(depositsAggregateSeries(depositsForCurrency), overviewCurrency)
    .filter((p) => p.x < now)
    .concat(depositsForCurrency.length ? [{ x: now, y: depositsCurrentTotal }] : []);
  const savingsPoints = seriesForCurrency(
    savingsAggregateSeries(state.savingsGoals.filter((g) => g.currency === overviewCurrency)),
    overviewCurrency
  );
  const salaryMonthly = monthlyTotalsByCurrency(state.salary.filter((s) => s.currency === overviewCurrency), { cumulative: true });
  const expensesMonthly = monthlyTotalsByCurrency(state.expenses.filter((e) => e.currency === overviewCurrency), { cumulative: true });

  chart.setSeries([
    { id: "deposits", label: "Вклады", points: depositsPoints },
    { id: "savings", label: "Накопления", points: savingsPoints },
    { id: "salary", label: "Зарплата (накопленно)", points: salaryMonthly.get(overviewCurrency) || [] },
    { id: "expenses", label: "Траты (накопленно)", points: expensesMonthly.get(overviewCurrency) || [] },
  ]);

  const totalsCard = el("div", { class: "card" }, [el("h2", {}, `Итого, ${overviewCurrency}`)]);
  const latest = (points) => (points.length ? points[points.length - 1].y : 0);
  const rows = [
    ["Вклады (текущая стоимость)", latest(depositsPoints)],
    ["Накопления", latest(savingsPoints)],
    ["Зарплата (всего)", latest(salaryMonthly.get(overviewCurrency) || [])],
    ["Траты (всего)", latest(expensesMonthly.get(overviewCurrency) || [])],
  ];
  for (const [label, value] of rows) {
    totalsCard.appendChild(
      el("div", { class: "stat-row" }, [el("span", {}, label), el("strong", {}, Math.round(value).toLocaleString("ru-RU"))])
    );
  }

  container.appendChild(el("div", { class: "view-grid" }, [totalsCard, card]));
}
