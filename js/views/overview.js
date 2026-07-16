import { el, formatMoney, formatDate, formatMonthAxis } from "../ui.js";
import { LineChart, DonutChart } from "../charts.js";
import { monthlyTotalsByCurrency, depositCurrentValue, savingsGoalProgress } from "../calculators.js";
import { buildRecentActivity, monthOverMonth, TYPE_ICON, TYPE_LABEL } from "../dashboard.js";
import { depositsAggregateSeries } from "./deposits.js";
import { savingsAggregateSeries } from "./savings.js";

let overviewCurrency = null;

function seriesForCurrency(series, currency) {
  const found = series.find((s) => s.id === currency);
  return found ? found.points : [];
}

function deltaBadge(deltaPct, goodDirection) {
  if (!isFinite(deltaPct) || deltaPct === 0) return el("span", { class: "delta muted small" }, "без изменений");
  const isUp = deltaPct > 0;
  const isGood = goodDirection === "up" ? isUp : !isUp;
  return el(
    "span",
    { class: "delta small " + (isGood ? "delta-positive" : "delta-negative") },
    `${isUp ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(0)}% к пред. месяцу`
  );
}

function statCard({ icon, label, value, currency, delta }) {
  return el("div", { class: "stat-card" }, [
    el("div", { class: "stat-card-icon" }, icon),
    el("div", { class: "stat-card-body" }, [
      el("div", { class: "stat-card-label" }, label),
      el("div", { class: "stat-card-value" }, formatMoney(value, currency)),
      delta || null,
    ]),
  ]);
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
  const cur = overviewCurrency;

  const tabs = el(
    "div",
    { class: "chip-row" },
    available.map((c) =>
      el(
        "button",
        {
          type: "button",
          class: "chip" + (c === cur ? " is-active" : ""),
          onClick: () => {
            overviewCurrency = c;
            ctx.rerender();
          },
        },
        c
      )
    )
  );

  const wrap = el("div", { class: "view-grid" });
  wrap.appendChild(el("div", { class: "card span-2" }, [el("h2", {}, "Главная"), tabs]));

  // --- Stat cards ---
  const depositsTotal = state.deposits.filter((d) => d.currency === cur).reduce((sum, d) => sum + depositCurrentValue(d), 0);
  const savingsTotal = state.savingsGoals
    .filter((g) => g.currency === cur)
    .reduce((sum, g) => sum + savingsGoalProgress(g).total, 0);
  const salaryMoM = monthOverMonth(state.salary, cur);
  const expensesMoM = monthOverMonth(state.expenses, cur);

  const statsRow = el("div", { class: "card span-2 stat-cards" }, [
    statCard({ icon: TYPE_ICON.deposit, label: "Вклады сейчас", value: depositsTotal, currency: cur }),
    statCard({ icon: TYPE_ICON.saving, label: "Накоплено", value: savingsTotal, currency: cur }),
    statCard({
      icon: TYPE_ICON.salary,
      label: "Доход в этом месяце",
      value: salaryMoM.current,
      currency: cur,
      delta: deltaBadge(salaryMoM.deltaPct, "up"),
    }),
    statCard({
      icon: TYPE_ICON.expense,
      label: "Траты в этом месяце",
      value: expensesMoM.current,
      currency: cur,
      delta: deltaBadge(expensesMoM.deltaPct, "down"),
    }),
  ]);
  wrap.appendChild(statsRow);

  // --- Expense breakdown (this month) + recent activity ---
  const now = new Date();
  const monthExpenses = state.expenses.filter((e) => {
    if (e.currency !== cur) return false;
    const d = new Date(e.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const byCategory = new Map();
  for (const e of monthExpenses) {
    const key = e.category || "Без категории";
    byCategory.set(key, (byCategory.get(key) || 0) + e.amount);
  }
  const donutCard = el("div", { class: "card" }, [el("h2", {}, "Траты по категориям в этом месяце")]);
  const donutHost = el("div");
  donutCard.appendChild(donutHost);
  const donut = new DonutChart(donutHost, {
    formatValue: (v) => formatMoney(v, cur),
    centerLabel: "Всего",
    emptyMessage: "Нет трат в этом месяце",
  });
  registerChart(donut);
  donut.setSegments(
    [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ id: label, label, value }))
  );

  const activityCard = el("div", { class: "card" }, [el("h2", {}, "Последние операции")]);
  const activity = buildRecentActivity(state, cur, 8);
  if (!activity.length) {
    activityCard.appendChild(el("p", { class: "muted" }, "Пока нет операций в этой валюте."));
  } else {
    const list = el("div", { class: "activity-list" });
    for (const item of activity) {
      list.appendChild(
        el("div", { class: "activity-item" }, [
          el("div", { class: "activity-icon" }, item.icon),
          el("div", { class: "activity-body" }, [
            el("div", { class: "activity-title" }, item.title),
            el("div", { class: "activity-meta muted small" }, [
              formatDate(item.date),
              item.subtitle ? ` · ${item.subtitle}` : "",
            ]),
          ]),
          el(
            "div",
            { class: "activity-amount " + (item.direction === "out" ? "text-negative" : "text-positive") },
            `${item.direction === "out" ? "−" : "+"}${formatMoney(Math.abs(item.amount), item.currency)}`
          ),
        ])
      );
    }
    activityCard.appendChild(list);
  }

  wrap.appendChild(donutCard);
  wrap.appendChild(activityCard);

  // --- Combined trend chart ---
  const chartCard = el("div", { class: "card span-2" }, [
    el("h2", {}, "Динамика по всем разделам"),
    el("p", { class: "muted small" }, "Накопительным итогом: вклады — текущая стоимость с процентами, накопления и доходы — сумма пополнений, траты — сумма расходов."),
  ]);
  const chartHost = el("div");
  chartCard.appendChild(chartHost);
  const chart = new LineChart(chartHost, {
    formatY: (v) => Math.round(v).toLocaleString("ru-RU"),
    formatX: formatMonthAxis,
    emptyMessage: "Добавьте данные в любом из разделов, чтобы увидеть общий график",
  });
  registerChart(chart);

  const depositsForCurrency = state.deposits.filter((d) => d.currency === cur);
  const nowMs = Date.now();
  const depositsPoints = seriesForCurrency(depositsAggregateSeries(depositsForCurrency), cur)
    .filter((p) => p.x < nowMs)
    .concat(depositsForCurrency.length ? [{ x: nowMs, y: depositsTotal }] : []);
  const savingsPoints = seriesForCurrency(
    savingsAggregateSeries(state.savingsGoals.filter((g) => g.currency === cur)),
    cur
  );
  const salaryMonthly = monthlyTotalsByCurrency(state.salary.filter((s) => s.currency === cur), { cumulative: true });
  const expensesMonthly = monthlyTotalsByCurrency(state.expenses.filter((e) => e.currency === cur), { cumulative: true });

  chart.setSeries([
    { id: "deposits", label: "Вклады", points: depositsPoints },
    { id: "savings", label: "Накопления", points: savingsPoints },
    { id: "salary", label: "Зарплата (накопленно)", points: salaryMonthly.get(cur) || [] },
    { id: "expenses", label: "Траты (накопленно)", points: expensesMonthly.get(cur) || [] },
  ]);
  wrap.appendChild(chartCard);

  container.appendChild(wrap);
}
