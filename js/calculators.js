// Financial math: deposit compound/simple interest, savings progress, monthly aggregation.

const DAY_MS = 86400000;
const CAP_PERIODS_PER_YEAR = { monthly: 12, quarterly: 4, yearly: 1 };

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Value of a deposit after `years` elapsed, per its capitalization settings. */
export function depositValueAt(deposit, years) {
  const r = deposit.rate / 100;
  if (years <= 0) return deposit.principal;
  if (deposit.capitalization) {
    const n = CAP_PERIODS_PER_YEAR[deposit.capFrequency] || 12;
    return deposit.principal * (1 + r / n) ** (n * years);
  }
  return deposit.principal * (1 + r * years);
}

export function depositTermEndDate(deposit) {
  return addMonths(new Date(deposit.startDate), deposit.termMonths || 0);
}

export function depositCurrentValue(deposit, asOf = new Date()) {
  const start = new Date(deposit.startDate);
  const end = depositTermEndDate(deposit);
  const clampedAsOf = asOf > end ? end : asOf;
  const years = Math.max(0, (clampedAsOf - start) / DAY_MS / 365);
  return depositValueAt(deposit, years);
}

export function depositProjectedFinalValue(deposit) {
  const years = (deposit.termMonths || 0) / 12;
  return depositValueAt(deposit, years);
}

/** Growth curve points (timestamp, value) from start date to term end. */
export function depositGrowthCurve(deposit, steps = 24) {
  const start = new Date(deposit.startDate);
  const end = depositTermEndDate(deposit);
  const totalYears = Math.max((end - start) / DAY_MS / 365, 1 / 365);
  const n = Math.max(steps, 2);
  const points = [];
  for (let i = 0; i <= n; i++) {
    const years = (totalYears * i) / n;
    const t = start.getTime() + years * 365 * DAY_MS;
    points.push({ x: t, y: depositValueAt(deposit, years) });
  }
  return points;
}

/** Cumulative savings-goal progress over time from its entries. */
export function savingsGoalProgress(goal) {
  const sorted = [...(goal.entries || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const points = sorted.map((e) => {
    running += e.amount;
    return { x: new Date(e.date).getTime(), y: running };
  });
  const total = running;
  const target = goal.targetAmount || 0;
  const percent = target > 0 ? Math.min(100, (total / target) * 100) : 0;
  return { points, total, target, remaining: Math.max(0, target - total), percent };
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Sum entries per calendar month, split by currency. Returns Map<currency, {x,y}[]>. */
export function monthlyTotalsByCurrency(entries, { cumulative = false } = {}) {
  const byCurrency = new Map();
  for (const e of entries) {
    if (!byCurrency.has(e.currency)) byCurrency.set(e.currency, new Map());
    const monthMap = byCurrency.get(e.currency);
    const key = monthKey(e.date);
    monthMap.set(key, (monthMap.get(key) || 0) + e.amount);
  }
  const result = new Map();
  for (const [currency, monthMap] of byCurrency) {
    const keys = [...monthMap.keys()].sort();
    let running = 0;
    const points = keys.map((key) => {
      const [y, m] = key.split("-").map(Number);
      running += monthMap.get(key);
      return { x: new Date(y, m - 1, 1).getTime(), y: cumulative ? running : monthMap.get(key) };
    });
    result.set(currency, points);
  }
  return result;
}

export function sumByCurrency(entries, amountFn = (e) => e.amount) {
  const totals = new Map();
  for (const e of entries) {
    totals.set(e.currency, (totals.get(e.currency) || 0) + amountFn(e));
  }
  return totals;
}
