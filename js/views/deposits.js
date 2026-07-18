import { el, formatMoney, formatDate, formatMonthAxis, currencySelect, showToast, confirmDialog } from "../ui.js";
import { generateId } from "../storage.js";
import { LineChart } from "../charts.js";
import { sortableHeader, sortRows, renderFilterBar, applyCommonFilters } from "../table-controls.js";
import {
  depositCurrentValue,
  depositProjectedFinalValue,
  depositTermEndDate,
  depositValueAt,
  depositGrowthCurve,
} from "../calculators.js";

const DAY_MS = 86400000;
let selectedDepositId = null;
let ratesExpanded = true;
let rateFilterCurrency = "BYN";
let rateSortKey = "rate"; // "rate" | "term"
let taxFreeOnly = false;
let rateSearch = "";
let tableFilter = { currency: "all", search: "" };
let tableSort = { key: "startDate", dir: "desc" };

// Belarusian tax rule: interest on a deposit is tax-free only if it's placed
// for at least this many months - 13 for BYN, 24 for foreign currency.
const TAX_FREE_MIN_MONTHS = { BYN: 13, USD: 24, EUR: 24, RUB: 24 };

function isTaxFree(offer) {
  const threshold = TAX_FREE_MIN_MONTHS[offer.currency];
  return threshold != null && offer.termMonths != null && offer.termMonths >= threshold;
}

export function depositsAggregateSeries(deposits) {
  const byCurrency = new Map();
  for (const d of deposits) {
    if (!byCurrency.has(d.currency)) byCurrency.set(d.currency, []);
    byCurrency.get(d.currency).push(d);
  }
  const series = [];
  for (const [currency, list] of byCurrency) {
    const starts = list.map((d) => new Date(d.startDate).getTime());
    const ends = list.map((d) => depositTermEndDate(d).getTime());
    const minT = Math.min(...starts);
    const maxT = Math.max(...ends, Date.now());
    const steps = 24;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = minT + ((maxT - minT) * i) / steps;
      let sum = 0;
      for (const d of list) {
        const start = new Date(d.startDate).getTime();
        if (t < start) continue;
        const end = depositTermEndDate(d).getTime();
        const years = (Math.min(t, end) - start) / DAY_MS / 365;
        sum += depositValueAt(d, years);
      }
      points.push({ x: t, y: sum });
    }
    series.push({ id: currency, label: currency, points });
  }
  return series;
}

function collapsibleHeader({ title, isOpen, onToggle }) {
  return el(
    "button",
    { type: "button", class: "collapsible-header", onClick: onToggle },
    [el("h2", {}, title), el("span", { class: "collapsible-chevron" + (isOpen ? " is-open" : "") }, "▾")]
  );
}

export function renderDeposits(container, ctx) {
  const { state, persist, registerChart, currencies, bankRates, rateHistory } = ctx;

  const form = el("form", { class: "form", id: "deposit-form" }, [
    el("div", { class: "form-row" }, [
      el("label", {}, ["Банк", el("input", { class: "input", name: "bank", required: "required", placeholder: "Напр. Приорбанк" })]),
      el("label", {}, ["Название вклада", el("input", { class: "input", name: "product", placeholder: "Необязательно" })]),
    ]),
    el("div", { class: "form-row" }, [
      el("label", {}, ["Валюта", currencySelect(currencies, "BYN")]),
      el("label", {}, ["Сумма вклада", el("input", { class: "input", name: "principal", type: "number", min: "0", step: "0.01", required: "required" })]),
      el("label", {}, ["Ставка, % годовых", el("input", { class: "input", name: "rate", type: "number", min: "0", step: "0.01", required: "required" })]),
    ]),
    el("div", { class: "form-row" }, [
      el("label", {}, ["Срок, мес.", el("input", { class: "input", name: "termMonths", type: "number", min: "1", step: "1", required: "required" })]),
      el("label", {}, ["Дата открытия", el("input", { class: "input", name: "startDate", type: "date", value: new Date().toISOString().slice(0, 10), required: "required" })]),
    ]),
    el("div", { class: "form-row" }, [
      el("label", { class: "checkbox-label" }, [
        el("input", { type: "checkbox", name: "capitalization", id: "dep-cap" }),
        " С капитализацией",
      ]),
      el("label", {}, [
        "Периодичность капитализации",
        el("select", { class: "input", name: "capFrequency", id: "dep-cap-freq", disabled: "disabled" }, [
          el("option", { value: "monthly" }, "Ежемесячно"),
          el("option", { value: "quarterly" }, "Ежеквартально"),
          el("option", { value: "yearly" }, "Ежегодно"),
        ]),
      ]),
    ]),
    el("label", {}, ["Заметка", el("input", { class: "input", name: "notes", placeholder: "Необязательно" })]),
    el("button", { class: "btn btn-primary", type: "submit" }, "Добавить вклад"),
  ]);

  const capCheckbox = form.querySelector("#dep-cap");
  const capFreqSelect = form.querySelector("#dep-cap-freq");
  capCheckbox.addEventListener("change", () => {
    capFreqSelect.disabled = !capCheckbox.checked;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const deposit = {
      id: generateId(),
      bank: data.get("bank").trim(),
      product: data.get("product").trim(),
      currency: data.get("currency"),
      principal: parseFloat(data.get("principal")),
      rate: parseFloat(data.get("rate")),
      termMonths: parseInt(data.get("termMonths"), 10),
      startDate: data.get("startDate"),
      capitalization: capCheckbox.checked,
      capFrequency: data.get("capFrequency"),
      notes: data.get("notes").trim(),
    };
    state.deposits.push(deposit);
    persist();
    showToast("Вклад добавлен");
    ctx.rerender();
  });

  const formCard = el("div", { class: "card" }, [el("h2", {}, "Добавить вклад"), form]);

  // --- Totals summary ---
  const totalsCard = el("div", { class: "card" }, [el("h2", {}, "Итого по вкладам")]);
  if (!state.deposits.length) {
    totalsCard.appendChild(el("p", { class: "muted" }, "Пока нет вкладов."));
  } else {
    const byCurrency = new Map();
    for (const d of state.deposits) {
      if (!byCurrency.has(d.currency)) byCurrency.set(d.currency, { principal: 0, current: 0 });
      const agg = byCurrency.get(d.currency);
      agg.principal += d.principal;
      agg.current += depositCurrentValue(d);
    }
    for (const [currency, agg] of byCurrency) {
      const gain = agg.current - agg.principal;
      totalsCard.appendChild(
        el("div", { class: "stat" }, [
          el("span", { class: "stat-value" }, formatMoney(agg.current, currency)),
          el("span", { class: "muted small" }, `${currency} · вложено ${formatMoney(agg.principal, currency)} · ${gain >= 0 ? "+" : ""}${formatMoney(gain, currency)}`),
        ])
      );
    }
  }

  // --- Table ---
  const tableCard = el("div", { class: "card span-2" }, [el("h2", {}, "Мои вклады")]);
  if (!state.deposits.length) {
    tableCard.appendChild(el("p", { class: "muted" }, "Пока нет вкладов — добавьте первый слева."));
  } else {
    const usedCurrencies = [...new Set(state.deposits.map((d) => d.currency))];
    renderFilterBar(tableCard, {
      state: tableFilter,
      currencies: usedCurrencies,
      onChange: ctx.rerender,
      searchPlaceholder: "Банк, вклад, заметка…",
    });

    const filtered = applyCommonFilters(state.deposits, tableFilter, {
      currencyOf: (d) => d.currency,
      searchableText: (d) => `${d.bank} ${d.product} ${d.notes || ""}`,
    });

    if (!filtered.length) {
      tableCard.appendChild(el("p", { class: "muted" }, "Нет вкладов по заданным фильтрам."));
    } else {
      const accessors = {
        bank: (d) => d.bank.toLowerCase(),
        currency: (d) => d.currency,
        principal: (d) => d.principal,
        rate: (d) => d.rate,
        termMonths: (d) => d.termMonths,
        startDate: (d) => new Date(d.startDate).getTime(),
        current: (d) => depositCurrentValue(d),
        final: (d) => depositProjectedFinalValue(d),
      };
      const sorted = sortRows(filtered, tableSort, accessors);
      const table = el("table", { class: "table table--stack" }, [
        el(
          "thead",
          {},
          el("tr", {}, [
            sortableHeader("Банк", "bank", tableSort, ctx.rerender),
            sortableHeader("Валюта", "currency", tableSort, ctx.rerender),
            sortableHeader("Сумма", "principal", tableSort, ctx.rerender),
            sortableHeader("Ставка", "rate", tableSort, ctx.rerender),
            sortableHeader("Срок", "termMonths", tableSort, ctx.rerender),
            sortableHeader("Текущая стоимость", "current", tableSort, ctx.rerender),
            sortableHeader("Итог по сроку", "final", tableSort, ctx.rerender),
            el("th", {}, ""),
          ])
        ),
      ]);
      const tbody = el("tbody");
      for (const d of sorted) {
        const current = depositCurrentValue(d);
        const final = depositProjectedFinalValue(d);
        const row = el("tr", { class: d.id === selectedDepositId ? "is-selected" : "" }, [
          el("td", { "data-label": "Банк" }, [el("strong", {}, d.bank), d.product ? el("div", { class: "muted small" }, d.product) : null]),
          el("td", { "data-label": "Валюта" }, d.currency),
          el("td", { "data-label": "Сумма" }, formatMoney(d.principal, d.currency)),
          el("td", { "data-label": "Ставка" }, `${d.rate}%${d.capitalization ? " (капит.)" : ""}`),
          el("td", { "data-label": "Срок" }, `${d.termMonths} мес. до ${formatDate(depositTermEndDate(d))}`),
          el("td", { "data-label": "Текущая стоимость" }, formatMoney(current, d.currency)),
          el("td", { "data-label": "Итог по сроку" }, formatMoney(final, d.currency)),
          el("td", { class: "table-actions" }, [
            el(
              "button",
              {
                class: "btn btn-small",
                type: "button",
                onClick: () => {
                  selectedDepositId = selectedDepositId === d.id ? null : d.id;
                  ctx.rerender();
                },
              },
              selectedDepositId === d.id ? "Скрыть график" : "График"
            ),
            el(
              "button",
              {
                class: "btn btn-small btn-danger",
                type: "button",
                onClick: () => {
                  if (!confirmDialog(`Удалить вклад «${d.bank}»?`)) return;
                  state.deposits = state.deposits.filter((x) => x.id !== d.id);
                  if (selectedDepositId === d.id) selectedDepositId = null;
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
  const selectedDeposit = state.deposits.find((d) => d.id === selectedDepositId);
  const chartCard = el("div", { class: "card span-2" }, [
    el("h2", {}, selectedDeposit ? `График: ${selectedDeposit.bank}${selectedDeposit.product ? " — " + selectedDeposit.product : ""}` : "Общий график вкладов"),
  ]);
  const chartHost = el("div");
  chartCard.appendChild(chartHost);
  const chart = new LineChart(chartHost, {
    formatY: (v) => Math.round(v).toLocaleString("ru-RU"),
    formatX: formatMonthAxis,
    emptyMessage: "Добавьте вклад, чтобы увидеть график",
  });
  registerChart(chart);
  if (selectedDeposit) {
    chart.setSeries([
      { id: selectedDeposit.id, label: selectedDeposit.currency, points: depositGrowthCurve(selectedDeposit) },
    ]);
  } else {
    chart.setSeries(depositsAggregateSeries(state.deposits));
  }

  // --- Bank rates panel (reference data, collapsed by default so it doesn't
  // bury the user's own deposits below a 100+ item list) ---
  const ratesCard = el("div", { class: "card span-2" }, [
    collapsibleHeader({
      title: "Ставки банков (Беларусь)",
      isOpen: ratesExpanded,
      onToggle: () => {
        ratesExpanded = !ratesExpanded;
        ctx.rerender();
      },
    }),
  ]);

  if (ratesExpanded) {
    const body = el("div", { class: "collapsible-body" });

    if (!bankRates) {
      body.appendChild(
        el("p", { class: "muted" }, "Данные не найдены. Запустите scripts/parse_rates.py (см. README), чтобы подтянуть актуальные ставки.")
      );
    } else {
      const tabs = el(
        "div",
        { class: "chip-row" },
        ["BYN", "USD", "EUR"].map((cur) =>
          el(
            "button",
            {
              type: "button",
              class: "chip" + (cur === rateFilterCurrency ? " is-active" : ""),
              onClick: () => {
                rateFilterCurrency = cur;
                ctx.rerender();
              },
            },
            cur
          )
        )
      );
      body.appendChild(tabs);

      const histPoints = (rateHistory || [])
        .filter((entry) => entry[rateFilterCurrency])
        .map((entry) => ({
          x: new Date(entry.date).getTime(),
          max: entry[rateFilterCurrency].maxRate,
          avg: entry[rateFilterCurrency].avgRate,
        }));
      if (histPoints.length) {
        body.appendChild(el("h3", { class: "subheading" }, `История ставок, ${rateFilterCurrency}`));
        if (histPoints.length === 1) {
          body.appendChild(
            el("p", { class: "muted small" }, "Пока одна точка — данные накапливаются раз в день, график наполнится со временем.")
          );
        }
        const historyChartHost = el("div");
        body.appendChild(historyChartHost);
        const historyChart = new LineChart(historyChartHost, {
          formatY: (v) => `${v.toFixed(1)}%`,
          formatX: (t) => formatDate(t),
          emptyMessage: "Пока недостаточно данных",
        });
        registerChart(historyChart);
        historyChart.setSeries([
          { id: "max", label: "Макс. ставка", points: histPoints.map((p) => ({ x: p.x, y: p.max })) },
          { id: "avg", label: "Средняя ставка", points: histPoints.map((p) => ({ x: p.x, y: p.avg })) },
        ]);
      }

      const sortRow = el("div", { class: "chip-row" }, [
        el(
          "button",
          { type: "button", class: "chip" + (rateSortKey === "rate" ? " is-active" : ""), onClick: () => { rateSortKey = "rate"; ctx.rerender(); } },
          "По ставке"
        ),
        el(
          "button",
          { type: "button", class: "chip" + (rateSortKey === "term" ? " is-active" : ""), onClick: () => { rateSortKey = "term"; ctx.rerender(); } },
          "По сроку"
        ),
        el(
          "button",
          { type: "button", class: "chip" + (taxFreeOnly ? " is-active" : ""), onClick: () => { taxFreeOnly = !taxFreeOnly; ctx.rerender(); } },
          `Без налога (от ${TAX_FREE_MIN_MONTHS[rateFilterCurrency]} мес.)`
        ),
      ]);
      body.appendChild(sortRow);

      const searchInput = el("input", {
        class: "input",
        type: "search",
        placeholder: "Поиск по банку или названию вклада…",
        value: rateSearch,
        onInput: (e) => {
          rateSearch = e.target.value;
          ctx.rerender();
        },
      });
      body.appendChild(el("div", { class: "rate-search" }, [searchInput]));

      const byCurrency = bankRates.offers.filter((o) => o.currency === rateFilterCurrency);
      let offers = byCurrency;
      if (taxFreeOnly) offers = offers.filter(isTaxFree);
      if (rateSearch.trim()) {
        const q = rateSearch.trim().toLowerCase();
        offers = offers.filter((o) => `${o.bank} ${o.product}`.toLowerCase().includes(q));
      }
      offers = offers.sort((a, b) => (rateSortKey === "term" ? (b.termMonths || 0) - (a.termMonths || 0) : b.rate - a.rate));

      body.appendChild(
        el(
          "p",
          { class: "muted small" },
          `Источник: myfin.by · обновлено ${formatDate(bankRates.updatedAt)} · показано ${offers.length} из ${byCurrency.length}`
        )
      );

      const list = el("div", { class: "rate-list" });
      if (!offers.length) {
        list.appendChild(el("p", { class: "muted" }, "Нет предложений по заданным фильтрам."));
      }
      for (const offer of offers) {
        list.appendChild(
          el("div", { class: "rate-item" }, [
            el("div", { class: "rate-item-main" }, [
              el("strong", {}, offer.bank),
              el("span", { class: "muted small" }, offer.product),
            ]),
            el("div", { class: "rate-item-metrics" }, [
              el("div", { class: "rate-metric" }, [el("span", { class: "rate-metric-label" }, "Ставка"), el("span", { class: "rate-metric-value" }, `${offer.rate}%`)]),
              offer.yieldTotal != null
                ? el("div", { class: "rate-metric" }, [el("span", { class: "rate-metric-label" }, "Доход"), el("span", { class: "rate-metric-value" }, `${offer.yieldTotal}%`)])
                : null,
              offer.termMonths
                ? el("div", { class: "rate-metric" }, [el("span", { class: "rate-metric-label" }, "Срок"), el("span", { class: "rate-metric-value" }, `${offer.termMonths} мес.`)])
                : null,
            ]),
            el("div", { class: "rate-item-footer" }, [
              el("div", { class: "rate-item-tags" }, [
                offer.capitalization ? el("span", { class: "tag" }, "Капитализация") : null,
                isTaxFree(offer) ? el("span", { class: "tag tag-good" }, "Без налога") : null,
              ]),
              el(
                "button",
                {
                  type: "button",
                  class: "btn btn-small",
                  onClick: () => {
                    form.bank.value = offer.bank;
                    form.product.value = offer.product;
                    form.currency.value = offer.currency;
                    form.rate.value = offer.rate;
                    if (offer.termMonths) form.termMonths.value = offer.termMonths;
                    capCheckbox.checked = !!offer.capitalization;
                    capFreqSelect.disabled = !capCheckbox.checked;
                    form.scrollIntoView({ behavior: "smooth", block: "start" });
                    showToast("Поля формы заполнены данными банка");
                  },
                },
                "Использовать"
              ),
            ]),
          ])
        );
      }
      body.appendChild(list);
    }
    ratesCard.appendChild(body);
  }

  container.appendChild(el("div", { class: "view-grid" }, [formCard, totalsCard, tableCard, chartCard, ratesCard]));
}
