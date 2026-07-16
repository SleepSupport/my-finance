// Global "+" button available on every tab, for the two entries you make
// most often (expenses, income) without navigating away from what you're doing.

import { el, currencySelect, showToast } from "./ui.js";
import { generateId } from "./storage.js";

let quickAddType = "expense"; // "expense" | "salary"

export function mountQuickAdd({ state, persist, currencies, onSaved }) {
  const fab = el("button", { id: "quick-add-fab", class: "fab", type: "button", "aria-label": "Быстро добавить" }, "+");
  const overlay = el("div", { id: "quick-add-overlay", class: "modal-overlay" });
  document.body.appendChild(fab);
  document.body.appendChild(overlay);

  function close() {
    overlay.classList.remove("is-open");
    overlay.innerHTML = "";
  }

  function renderModal() {
    overlay.innerHTML = "";
    const isExpense = quickAddType === "expense";

    const typeToggle = el("div", { class: "chip-row" }, [
      el(
        "button",
        { type: "button", class: "chip" + (isExpense ? " is-active" : ""), onClick: () => { quickAddType = "expense"; renderModal(); } },
        "🧾 Трата"
      ),
      el(
        "button",
        { type: "button", class: "chip" + (!isExpense ? " is-active" : ""), onClick: () => { quickAddType = "salary"; renderModal(); } },
        "💰 Доход"
      ),
    ]);

    const amountInput = el("input", {
      class: "input quick-add-amount",
      type: "number",
      min: "0",
      step: "0.01",
      placeholder: "0",
      required: "required",
      inputmode: "decimal",
    });
    const currencyInput = currencySelect(currencies, "BYN");
    const dateInput = el("input", { class: "input", type: "date", value: new Date().toISOString().slice(0, 10) });
    const noteInput = el("input", { class: "input", placeholder: "Заметка (необязательно)" });
    const categoryInput = el("input", {
      class: "input",
      list: "quick-category-options",
      placeholder: "Выберите или введите новую",
      required: "required",
    });
    const categoryList = el("datalist", { id: "quick-category-options" }, state.expenseCategories.map((c) => el("option", { value: c })));
    const sourceInput = el("input", { class: "input", placeholder: "Напр. Основная работа" });

    const form = el("form", { class: "form quick-add-form" }, [
      typeToggle,
      el("label", { class: "quick-add-amount-label" }, ["Сумма", amountInput]),
      el("div", { class: "form-row" }, [
        el("label", {}, ["Валюта", currencyInput]),
        el("label", {}, ["Дата", dateInput]),
      ]),
      isExpense
        ? el("label", {}, ["Категория", categoryInput, categoryList])
        : el("label", {}, ["Источник", sourceInput]),
      el("label", {}, ["Заметка", noteInput]),
      el("div", { class: "form-row" }, [
        el("button", { type: "submit", class: "btn btn-primary" }, "Сохранить"),
        el("button", { type: "button", class: "btn", onClick: close }, "Отмена"),
      ]),
    ]);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const amount = parseFloat(amountInput.value);
      if (!amount || amount <= 0) {
        amountInput.focus();
        return;
      }
      if (isExpense) {
        const category = categoryInput.value.trim();
        if (category && !state.expenseCategories.includes(category)) state.expenseCategories.push(category);
        state.expenses.push({
          id: generateId(),
          date: dateInput.value,
          currency: currencyInput.value,
          amount,
          category,
          note: noteInput.value.trim(),
        });
      } else {
        state.salary.push({
          id: generateId(),
          date: dateInput.value,
          currency: currencyInput.value,
          amount,
          source: sourceInput.value.trim(),
          note: noteInput.value.trim(),
        });
      }
      persist();
      showToast(isExpense ? "Трата добавлена" : "Доход добавлен");
      close();
      onSaved();
    });

    const modalBox = el("div", { class: "modal-box" }, [
      el("div", { class: "modal-header" }, [
        el("h2", {}, "Быстрое добавление"),
        el("button", { type: "button", class: "modal-close", onClick: close, "aria-label": "Закрыть" }, "✕"),
      ]),
      form,
    ]);
    overlay.appendChild(modalBox);
    setTimeout(() => amountInput.focus(), 50);
  }

  function open() {
    renderModal();
    overlay.classList.add("is-open");
  }

  fab.addEventListener("click", open);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
  });
}
