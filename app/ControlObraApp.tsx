"use client";

import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useState } from "react";

type Currency = "ARS" | "USD";
type Category = { id: string; name: string; archived: boolean; subcategoryIds?: string[] };
type Subcategory = Category;
type ExpenseKind = "manual" | "approved" | "additional";
type Expense = {
  id: string;
  date: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  responsible: string;
  amount: number;
  currency: Currency;
  rate: number;
  kind: ExpenseKind;
  budgetGroupId?: string;
};
type Payment = {
  id: string;
  expenseId: string;
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  rate: number;
};
type ProgressItem = { id: string; categoryId: string; subcategoryId: string; percent: number };
type BudgetOffer = {
  id: string;
  supplier: string;
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  rate: number;
};
type BudgetGroup = {
  id: string;
  name: string;
  categoryId: string;
  subcategoryId: string;
  offers: BudgetOffer[];
  approvedOfferId?: string;
};
type InvestorContribution = { id: string; date: string; amount: number };
type Investor = {
  id: string;
  name: string;
  profitUsd: number;
  contributions: InvestorContribution[];
};
type InvestmentPlan = {
  propertyValueUsd: number;
  ownCapitalUsd: number;
  remodelBudgetUsd: number;
  projectedSalePriceUsd: number;
  projectedSaleDate: string;
};
type AppState = {
  catalogVersion?: number;
  categories: Category[];
  subcategories: Subcategory[];
  expenses: Expense[];
  payments: Payment[];
  progress: ProgressItem[];
  budgetGroups: BudgetGroup[];
  investors: Investor[];
  investmentPlan: InvestmentPlan;
};
type View = "home" | "expenses" | "payments" | "progress" | "budgets" | "categories" | "investors";
type ModalName = "expense" | "payment" | "progress" | "budget" | "offer" | "rate" | "investor" | "contribution" | "investmentPlan" | null;

const emptyInvestmentPlan: InvestmentPlan = {
  propertyValueUsd: 0,
  ownCapitalUsd: 0,
  remodelBudgetUsd: 0,
  projectedSalePriceUsd: 0,
  projectedSaleDate: "",
};

const defaultSubcategories: Subcategory[] = [
  { id: "sub-mano-obra", name: "Mano de obra", archived: false },
  { id: "sub-materiales", name: "Materiales", archived: false },
  { id: "sub-adicionales", name: "Adicionales", archived: false },
];

const defaultCategories: Category[] = [
  { id: "cat-contratista", name: "Contratista", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales", "sub-adicionales"] },
  { id: "cat-electricista", name: "Electricista", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
  { id: "cat-plomeria", name: "Plomería", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
  { id: "cat-pintor", name: "Pintor", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
  { id: "cat-colocador-pisos", name: "Colocador de pisos", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
  { id: "cat-zinguero", name: "Zinguero", archived: false, subcategoryIds: [] },
  { id: "cat-muebles-cocina", name: "Muebles de cocina", archived: false, subcategoryIds: [] },
  { id: "cat-placares", name: "Placares", archived: false, subcategoryIds: [] },
  { id: "cat-ventanas", name: "Ventanas", archived: false, subcategoryIds: [] },
];

const initialState: AppState = {
  catalogVersion: 2,
  categories: defaultCategories,
  subcategories: defaultSubcategories,
  expenses: [],
  payments: [],
  progress: [],
  budgetGroups: [],
  investors: [],
  investmentPlan: emptyInvestmentPlan,
};

function normalizeState(candidate: AppState | undefined): AppState {
  if (!candidate?.categories || !candidate?.subcategories) return initialState;
  const investmentState = {
    investors: Array.isArray(candidate.investors) ? candidate.investors : [],
    investmentPlan: { ...emptyInvestmentPlan, ...(candidate.investmentPlan ?? {}) },
  };
  if ((candidate.catalogVersion ?? 0) >= 2) return { ...candidate, ...investmentState };

  const referencedCategories = new Set([
    ...candidate.expenses.map((item) => item.categoryId),
    ...candidate.progress.map((item) => item.categoryId),
    ...candidate.budgetGroups.map((item) => item.categoryId),
  ]);
  const referencedSubcategories = new Set([
    ...candidate.expenses.map((item) => item.subcategoryId),
    ...candidate.progress.map((item) => item.subcategoryId),
    ...candidate.budgetGroups.map((item) => item.subcategoryId),
  ]);
  const defaultCategoryIds = new Set(defaultCategories.map((item) => item.id));
  const defaultSubcategoryIds = new Set(defaultSubcategories.map((item) => item.id));
  const oldSeedCategories = new Set(["cat-materiales", "cat-mano-obra"]);

  const preservedCategories = candidate.categories
    .filter((item) => !defaultCategoryIds.has(item.id))
    .filter((item) => !oldSeedCategories.has(item.id) || referencedCategories.has(item.id))
    .map((item) => oldSeedCategories.has(item.id) ? { ...item, archived: true } : item);
  const preservedSubcategories = candidate.subcategories
    .filter((item) => !defaultSubcategoryIds.has(item.id))
    .filter((item) => item.id !== "sub-bano-cocina" || referencedSubcategories.has(item.id))
    .map((item) => item.id === "sub-bano-cocina" ? { ...item, archived: true } : item);

  return {
    ...candidate,
    catalogVersion: 2,
    categories: [...defaultCategories, ...preservedCategories],
    subcategories: [...defaultSubcategories, ...preservedSubcategories],
    ...investmentState,
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const money = (value: number, currency: Currency) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ARS" ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
const formatEditableAmount = (value: string) => {
  if (!value) return "";
  const [integer = "0", decimals] = value.split(".");
  const grouped = integer.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals !== undefined ? `${grouped},${decimals.slice(0, 2)}` : grouped;
};
const parseEditableAmount = (displayValue: string) => {
  const cleaned = displayValue.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  const commaIndex = cleaned.lastIndexOf(",");
  const decimalIndex = commaIndex;
  const integerDigits = (decimalIndex >= 0 ? cleaned.slice(0, decimalIndex) : cleaned).replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const decimalDigits = decimalIndex >= 0 ? cleaned.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2) : "";
  return decimalIndex >= 0 ? `${integerDigits}.${decimalDigits}` : integerDigits;
};
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
const toArs = (amount: number, currency: Currency, rate: number) =>
  currency === "ARS" ? amount : amount * rate;
const toUsd = (amount: number, currency: Currency, rate: number) =>
  currency === "USD" ? amount : amount / rate;
const percent = (value: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)}%`;
const investorMetrics = (investor: Investor, projectedSaleDate: string) => {
  const capital = investor.contributions.reduce((sum, item) => sum + item.amount, 0);
  const totalReturnPercent = capital ? (investor.profitUsd / capital) * 100 : 0;
  if (!capital || !projectedSaleDate) return { capital, totalReturnPercent, annualRate: null as number | null };
  const weightedContributionTime = investor.contributions.reduce((sum, item) => sum + new Date(`${item.date}T12:00:00`).getTime() * item.amount, 0) / capital;
  const saleTime = new Date(`${projectedSaleDate}T12:00:00`).getTime();
  const days = (saleTime - weightedContributionTime) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return { capital, totalReturnPercent, annualRate: null as number | null };
  const annualRate = (Math.pow((capital + investor.profitUsd) / capital, 365 / days) - 1) * 100;
  return { capital, totalReturnPercent, annualRate: Number.isFinite(annualRate) ? annualRate : null };
};
const linkedSubcategories = (categoryId: string, categories: Category[], subcategories: Subcategory[]) => {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return [];
  if (!Array.isArray(category.subcategoryIds)) return subcategories.filter((item) => !item.archived);
  return subcategories.filter((item) => !item.archived && category.subcategoryIds?.includes(item.id));
};

function FormattedAmountInput({ value, setValue, ariaLabel, placeholder = "0", required = false, invalid = false }: { value: string; setValue: (value: string) => void; ariaLabel?: string; placeholder?: string; required?: boolean; invalid?: boolean }) {
  return <input
    aria-label={ariaLabel}
    aria-invalid={invalid || undefined}
    required={required}
    type="text"
    inputMode="decimal"
    value={formatEditableAmount(value)}
    onChange={(event) => setValue(parseEditableAmount(event.target.value))}
    placeholder={placeholder}
  />;
}

const nav: Array<{ id: View; label: string; icon: string }> = [
  { id: "home", label: "Resumen", icon: "⌂" },
  { id: "expenses", label: "Gastos", icon: "$" },
  { id: "payments", label: "Pagos", icon: "✓" },
  { id: "budgets", label: "Presupuestos", icon: "≡" },
  { id: "investors", label: "Inversores", icon: "↗" },
];

function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Control de Obra</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Cerrar">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function CurrencyFields({ currency, setCurrency }: { currency: Currency; setCurrency: (value: Currency) => void }) {
  return (
    <div className="currency-toggle" aria-label="Moneda">
      <button type="button" className={currency === "ARS" ? "active" : ""} onClick={() => setCurrency("ARS")}>ARS</button>
      <button type="button" className={currency === "USD" ? "active" : ""} onClick={() => setCurrency("USD")}>USD</button>
    </div>
  );
}

function ProgressBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "green" | "amber" }) {
  return (
    <div className={`progress-track ${tone}`} aria-label={`${Math.round(value)} por ciento`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ControlObraApp() {
  const [data, setData] = useState<AppState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("home");
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string>("");
  const [expandedExpenseId, setExpandedExpenseId] = useState<string>("");
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>("");
  const [selectedContributionId, setSelectedContributionId] = useState<string>("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>("all");
  const [rate, setRate] = useState(1500);
  const [rateDate, setRateDate] = useState(today());
  const [rateSource, setRateSource] = useState("Cotización manual");
  const [saveStatus, setSaveStatus] = useState<"loading" | "saved" | "saving" | "offline">("loading");
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/state").then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/exchange-rate").then((response) => response.ok ? response.json() : Promise.reject()),
    ])
      .then(([stateResult, rateResult]) => {
        setData(normalizeState(stateResult.state));
        setRate(Number(rateResult.rate) || 1500);
        setRateDate((rateResult.date ?? today()).slice(0, 10));
        setRateSource(rateResult.source ?? "BCRA · promedio vendedor");
        setSaveStatus("saved");
      })
      .catch(async () => {
        try {
          const stateResponse = await fetch("/api/state");
          if (stateResponse.ok) setData(normalizeState((await stateResponse.json()).state));
        } catch { /* El editor local puede iniciar antes que la base. */ }
        setSaveStatus("offline");
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        setSaveStatus(response.ok ? "saved" : "offline");
      } catch {
        setSaveStatus("offline");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, loaded]);

  const categories = data.categories.filter((item) => !item.archived);
  const subcategories = data.subcategories.filter((item) => !item.archived);
  const categoryName = (id: string) => data.categories.find((item) => item.id === id)?.name ?? "Sin categoría";
  const subcategoryName = (id: string) => id ? data.subcategories.find((item) => item.id === id)?.name ?? "Sin subcategoría" : "";
  const pathName = (categoryId: string, subcategoryId: string) =>
    [categoryName(categoryId), subcategoryName(subcategoryId)].filter(Boolean).join(" · ");
  const subcategoriesFor = (categoryId: string) => {
    return linkedSubcategories(categoryId, data.categories, data.subcategories);
  };
  const paymentForExpense = (expense: Expense) => data.payments
    .filter((payment) => payment.expenseId === expense.id)
    .reduce((sum, payment) => {
      if (expense.currency === payment.currency) return sum + payment.amount;
      return sum + (expense.currency === "ARS" ? payment.amount * payment.rate : payment.amount / payment.rate);
    }, 0);
  const remainingForExpense = (expense: Expense) => Math.max(0, expense.amount - paymentForExpense(expense));

  const totals = useMemo(() => {
    const committedArs = data.expenses.reduce((sum, item) => sum + toArs(item.amount, item.currency, item.rate), 0);
    const committedUsd = data.expenses.reduce((sum, item) => sum + toUsd(item.amount, item.currency, item.rate), 0);
    const remainingArs = data.expenses.reduce((sum, item) => sum + toArs(remainingForExpense(item), item.currency, item.rate), 0);
    const remainingUsd = data.expenses.reduce((sum, item) => sum + toUsd(remainingForExpense(item), item.currency, item.rate), 0);
    const approvedArs = data.expenses.filter((item) => item.kind === "approved").reduce((sum, item) => sum + toArs(item.amount, item.currency, item.rate), 0);
    const additionalArs = data.expenses.filter((item) => item.kind === "additional").reduce((sum, item) => sum + toArs(item.amount, item.currency, item.rate), 0);
    const averageProgress = data.progress.length ? data.progress.reduce((sum, item) => sum + item.percent, 0) / data.progress.length : 0;
    return {
      committedArs,
      committedUsd,
      remainingArs,
      remainingUsd,
      paidArs: committedArs - remainingArs,
      paidUsd: committedUsd - remainingUsd,
      approvedArs,
      additionalArs,
      averageProgress,
      paidPercent: committedArs ? ((committedArs - remainingArs) / committedArs) * 100 : 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const quickOpen = (nextModal: ModalName, nextView?: View) => {
    if (nextView) setView(nextView);
    setModal(nextModal);
  };

  const addNamedItem = (kind: "category" | "subcategory") => {
    const label = kind === "category" ? "categoría" : "subcategoría";
    const name = window.prompt(`Nombre de la nueva ${label}`)?.trim();
    if (!name) return "";
    const id = uid(kind === "category" ? "cat" : "sub");
    setData((current) => kind === "category"
      ? { ...current, categories: [...current.categories, { id, name, archived: false, subcategoryIds: [] }] }
      : { ...current, subcategories: [...current.subcategories, { id, name, archived: false }] });
    return id;
  };

  const addSubcategoryForCategory = (categoryId: string) => {
    if (!categoryId) return "";
    const name = window.prompt("Nombre de la nueva subcategoría")?.trim();
    if (!name) return "";
    const existing = data.subcategories.find((item) => item.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"));
    const id = existing?.id ?? uid("sub");
    setData((current) => ({
      ...current,
      subcategories: existing ? current.subcategories : [...current.subcategories, { id, name, archived: false }],
      categories: current.categories.map((category) => category.id === categoryId
        ? { ...category, subcategoryIds: Array.from(new Set([...(category.subcategoryIds ?? []), id])) }
        : category),
    }));
    return id;
  };

  const renderHome = () => (
    <div className="page-content home-view">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">Vista general</span>
          <h1>Todo lo importante, de un vistazo.</h1>
          <p>Costos, pagos y avance físico se calculan por separado para que cada número sea claro.</p>
        </div>
        <button className="primary-button large" onClick={() => quickOpen("expense")}>＋ Ingresar gasto</button>
      </section>

      <section className="summary-grid">
        <article className="summary-card featured">
          <div className="summary-icon">$</div>
          <span>Total comprometido</span>
          <strong>{money(totals.committedArs, "ARS")}</strong>
          <small>{money(totals.committedUsd, "USD")} · cotizaciones históricas</small>
        </article>
        <article className="summary-card">
          <div className="summary-icon green">✓</div>
          <span>Total pagado</span>
          <strong>{money(totals.paidArs, "ARS")}</strong>
          <small>{money(totals.paidUsd, "USD")}</small>
        </article>
        <article className="summary-card">
          <div className="summary-icon amber">↗</div>
          <span>Saldo pendiente</span>
          <strong>{money(totals.remainingArs, "ARS")}</strong>
          <small>{money(totals.remainingUsd, "USD")}</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel payment-panel">
          <div className="panel-head">
            <div><span className="eyebrow">Pagos</span><h2>Avance financiero</h2></div>
            <strong className="big-percent">{Math.round(totals.paidPercent)}%</strong>
          </div>
          <ProgressBar value={totals.paidPercent} tone="green" />
          <div className="split-labels">
            <span><b>{money(totals.paidArs, "ARS")}</b> pagado</span>
            <span><b>{money(totals.remainingArs, "ARS")}</b> pendiente</span>
          </div>
          <button className="secondary-button full" onClick={() => quickOpen("payment", "payments")}>Registrar un pago</button>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Comparación</span><h2>Presupuesto y adicionales</h2></div>
            <button className="text-button" onClick={() => setView("budgets")}>Ver presupuestos →</button>
          </div>
          <div className="comparison-row"><span>Presupuestos aprobados</span><b>{money(totals.approvedArs, "ARS")}</b></div>
          <div className="comparison-row additional"><span>Gastos adicionales</span><b>+ {money(totals.additionalArs, "ARS")}</b></div>
          <div className="comparison-total"><span>Costo real registrado</span><strong>{money(totals.committedArs, "ARS")}</strong></div>
        </article>
      </section>

      <section className="quick-section">
        <div className="section-title"><div><span className="eyebrow">Accesos rápidos</span><h2>¿Qué querés hacer?</h2></div></div>
        <div className="quick-grid">
          <button onClick={() => quickOpen("expense")}><span className="quick-icon blue">＋</span><b>Ingresar gasto</b><small>Nuevo movimiento</small></button>
          <button onClick={() => quickOpen("payment", "payments")}><span className="quick-icon green">$</span><b>Ingresar pago</b><small>Total o parcial</small></button>
          <button onClick={() => quickOpen("budget", "budgets")}><span className="quick-icon amber">≡</span><b>Nuevo presupuesto</b><small>Comparar proveedores</small></button>
        </div>
      </section>
    </div>
  );

  const renderExpenses = () => {
    const filteredExpenses = data.expenses
      .filter((expense) => expenseCategoryFilter === "all" || expense.categoryId === expenseCategoryFilter)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    return <div className="page-content">
      <PageHeading eyebrow="Movimientos" title="Gastos" copy="Tocá cualquier fila para registrar un pago sin salir de esta pantalla." action="Ingresar gasto" onAction={() => setModal("expense")} />
      <div className="expense-category-filters" aria-label="Filtrar gastos por categoría">
        <button className={expenseCategoryFilter === "all" ? "active" : ""} onClick={() => setExpenseCategoryFilter("all")}>Todos <span>{data.expenses.length}</span></button>
        {categories.map((category) => {
          const count = data.expenses.filter((expense) => expense.categoryId === category.id).length;
          return <button key={category.id} className={expenseCategoryFilter === category.id ? "active" : ""} onClick={() => setExpenseCategoryFilter(category.id)}>{category.name} <span>{count}</span></button>;
        })}
      </div>
      {data.expenses.length === 0 ? <EmptyState icon="$" title="Todavía no hay gastos" copy="Ingresá el primer gasto o aprobá un presupuesto para comenzar." action="Ingresar gasto" onAction={() => setModal("expense")} /> : filteredExpenses.length === 0 ? <div className="filtered-empty"><b>No hay gastos en esta categoría.</b><button className="text-button" onClick={() => setExpenseCategoryFilter("all")}>Ver todos</button></div> : (
        <div className="expense-sheet-wrap">
          <table className="expense-sheet">
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Subcategoría</th><th>Descripción</th><th>Responsable</th><th className="number-cell">Monto</th><th className="number-cell">Pagado</th><th className="number-cell">Saldo</th><th>Acciones</th></tr></thead>
            <tbody>{filteredExpenses.map((expense) => {
              const paid = paymentForExpense(expense);
              const remaining = remainingForExpense(expense);
              const expanded = expandedExpenseId === expense.id;
              const togglePayment = () => setExpandedExpenseId((current) => current === expense.id ? "" : expense.id);
              return <Fragment key={expense.id}><tr
                className={`expense-data-row ${expanded ? "expanded" : ""}`}
                tabIndex={0}
                aria-expanded={expanded}
                onClick={togglePayment}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    togglePayment();
                  }
                }}
              >
                <td className="date-cell">{shortDate(expense.date)}</td>
                <td><b>{categoryName(expense.categoryId)}</b></td>
                <td>{subcategoryName(expense.subcategoryId) || "—"}</td>
                <td>{expense.description || "—"}</td>
                <td>{expense.responsible || "—"}</td>
                <td className="number-cell"><b>{money(expense.amount, expense.currency)}</b></td>
                <td className="number-cell paid-cell">{money(paid, expense.currency)}</td>
                <td className="number-cell balance-cell">{money(remaining, expense.currency)}</td>
                <td><div className="expense-row-actions">
                  <button className="row-payment-button" type="button" onClick={(event) => { event.stopPropagation(); togglePayment(); }}>{expanded ? "Cerrar" : remaining > 0.005 ? "Pagar" : "Ver"}</button>
                  <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedExpenseId(expense.id); setModal("expense"); }}>Editar</button>
                </div></td>
              </tr>
              {expanded && <tr className="expense-payment-row"><td colSpan={9}>
                <InlinePaymentForm
                  expense={expense}
                  rate={rate}
                  remaining={remaining}
                  close={() => setExpandedExpenseId("")}
                  save={(payment) => {
                    setData((current) => ({ ...current, payments: [...current.payments, payment] }));
                    setExpandedExpenseId("");
                    notify("Pago registrado");
                  }}
                />
              </td></tr>}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>;
  };

  const renderPayments = () => {
    const pending = data.expenses.filter((expense) => remainingForExpense(expense) > 0.005);
    return <div className="page-content">
      <PageHeading eyebrow="Pagos parciales" title="Pagos" copy="Elegí un gasto pendiente y registrá lo que pagaste, en pesos o dólares." />
      {pending.length === 0 ? <EmptyState icon="✓" title="No hay pagos pendientes" copy="Cuando cargues un gasto, aparecerá acá para registrar pagos." /> : (
        <div className="payment-list">
          {pending.map((expense) => {
            const paid = paymentForExpense(expense);
            const remaining = remainingForExpense(expense);
            const percent = expense.amount ? Math.min(100, paid / expense.amount * 100) : 0;
            return <article className="payment-card" key={expense.id}>
              <div className="payment-card-top">
                <div><span className="soft-label">{pathName(expense.categoryId, expense.subcategoryId)}</span><h3>{expense.description}</h3></div>
                <span className="pending-pill">Pendiente</span>
              </div>
              <div className="payment-numbers"><span>Total <b>{money(expense.amount, expense.currency)}</b></span><span>Pagado <b>{money(paid, expense.currency)}</b></span><span>Resta <b>{money(remaining, expense.currency)}</b></span></div>
              <ProgressBar value={percent} />
              <button className="primary-button full" onClick={() => { setSelectedExpenseId(expense.id); setModal("payment"); }}>Registrar pago</button>
            </article>;
          })}
        </div>
      )}
      {data.payments.length > 0 && <section className="history-section"><div className="section-title"><div><span className="eyebrow">Historial</span><h2>Últimos pagos</h2></div></div>
        <div className="list-panel compact">{data.payments.slice().reverse().slice(0, 8).map((payment) => {
          const expense = data.expenses.find((item) => item.id === payment.expenseId);
          return <div className="history-row" key={payment.id}><span className="history-check">✓</span><div><b>{expense?.description ?? "Gasto"}</b><small>{payment.description || "Pago registrado"} · {shortDate(payment.date)}</small></div><strong>{money(payment.amount, payment.currency)}</strong></div>;
        })}</div>
      </section>}
    </div>;
  };

  const renderProgress = () => (
    <div className="page-content">
      <PageHeading eyebrow="Avance físico" title="Progreso de la obra" copy="Este porcentaje es independiente de lo que se pagó." action="Agregar sector" onAction={() => setModal("progress")} />
      {data.progress.length === 0 ? <EmptyState icon="%" title="Todavía no cargaste avances" copy="Agregá un sector de la obra y marcá su progreso entre 0% y 100%." action="Agregar sector" onAction={() => setModal("progress")} /> : (
        <div className="progress-grid">{data.progress.map((item) => <article className="progress-card" key={item.id}>
          <div className="progress-card-head"><div><span className="soft-label">{item.subcategoryId ? categoryName(item.categoryId) : "Categoría general"}</span><h3>{subcategoryName(item.subcategoryId) || categoryName(item.categoryId)}</h3></div><strong>{item.percent}%</strong></div>
          <input className="range" type="range" min="0" max="100" step="5" value={item.percent} onChange={(event) => setData((current) => ({ ...current, progress: current.progress.map((progress) => progress.id === item.id ? { ...progress, percent: Number(event.target.value) } : progress) }))} />
          <ProgressBar value={item.percent} tone={item.percent === 100 ? "green" : "blue"} />
          <div className="status-line"><span className={`status-dot ${item.percent === 100 ? "done" : item.percent > 0 ? "doing" : "todo"}`} />{item.percent === 100 ? "Terminado" : item.percent > 0 ? "En progreso" : "Sin comenzar"}</div>
        </article>)}</div>
      )}
    </div>
  );

  const renderBudgets = () => (
    <div className="page-content">
      <PageHeading eyebrow="Comparaciones" title="Presupuestos" copy="Compará todas las ofertas y aprobá una completa cuando decidas." action="Nueva comparación" onAction={() => setModal("budget")} />
      {data.budgetGroups.length === 0 ? <EmptyState icon="≡" title="No hay presupuestos cargados" copy="Creá una comparación y agregá uno o varios proveedores." action="Nueva comparación" onAction={() => setModal("budget")} /> : (
        <div className="budget-groups">{data.budgetGroups.map((group) => {
          const amounts = group.offers.map((offer) => toArs(offer.amount, offer.currency, offer.rate));
          const cheapest = amounts.length ? Math.min(...amounts) : 0;
          const approved = group.offers.find((offer) => offer.id === group.approvedOfferId);
          return <section className="budget-group" key={group.id}>
            <div className="budget-group-head"><div><span className="soft-label">{pathName(group.categoryId, group.subcategoryId)}</span><h2>{group.name}</h2></div><div className="budget-head-actions">{approved && <span className="approved-pill">✓ {approved.supplier}</span>}<button className="secondary-button" onClick={() => { setSelectedBudgetId(group.id); setModal("offer"); }}>＋ Agregar oferta</button></div></div>
            {group.offers.length === 0 ? <div className="inline-empty">Todavía no hay ofertas en esta comparación.</div> : <div className="offers-grid">{group.offers.map((offer) => {
              const ars = toArs(offer.amount, offer.currency, offer.rate);
              const isApproved = offer.id === group.approvedOfferId;
              const isCheapest = Math.abs(ars - cheapest) < 0.01;
              const diff = cheapest ? ((ars - cheapest) / cheapest) * 100 : 0;
              return <article className={`offer-card ${isApproved ? "approved" : isCheapest ? "cheapest" : "higher"}`} key={offer.id} title={isCheapest ? "Es la oferta más económica" : `${Math.round(diff)}% por encima de la oferta más económica`}>
                <div className="offer-top"><span>{isApproved ? "Aprobado" : isCheapest ? "Mejor precio" : `+${Math.round(diff)}%`}</span><time>{shortDate(offer.date)}</time></div>
                <h3>{offer.supplier}</h3><p>{offer.description || "Sin descripción adicional"}</p>
                <strong>{money(offer.amount, offer.currency)}</strong><small>{offer.currency === "ARS" ? money(toUsd(offer.amount, offer.currency, offer.rate), "USD") : money(ars, "ARS")} · dólar {money(offer.rate, "ARS")}</small>
                {!group.approvedOfferId && <button className="primary-button full" onClick={() => approveOffer(group.id, offer.id)}>Aprobar presupuesto</button>}
              </article>;
            })}</div>}
          </section>;
        })}</div>
      )}
    </div>
  );

  const renderInvestors = () => {
    const plan = data.investmentPlan;
    const investorCapital = data.investors.reduce((sum, investor) => sum + investorMetrics(investor, plan.projectedSaleDate).capital, 0);
    const investorProfit = data.investors.reduce((sum, investor) => sum + investor.profitUsd, 0);
    return <div className="page-content">
      <PageHeading eyebrow="Financiamiento" title="Inversores" copy="Registrá la propiedad, los aportes recibidos y la rentabilidad estimada de cada inversor." action="Nuevo inversor" onAction={() => { setSelectedInvestorId(""); setModal("investor"); }} />

      <section className="investment-plan-panel">
        <div className="investment-plan-head"><div><span className="eyebrow">Proyecto en dólares</span><h2>Propiedad y proyección de venta</h2></div><button className="secondary-button" onClick={() => setModal("investmentPlan")}>Editar valores</button></div>
        <div className="investment-plan-grid">
          <article><span>Valor de la propiedad</span><strong>{money(plan.propertyValueUsd, "USD")}</strong><small>Precio de compra</small></article>
          <article><span>Presupuesto de remodelación</span><strong>{money(plan.remodelBudgetUsd, "USD")}</strong><small>Estimación cargada</small></article>
          <article className="automatic"><span>Gastos registrados</span><strong>{money(totals.committedUsd, "USD")}</strong><small>Se calcula desde Gastos</small></article>
          <article className="sale"><span>Precio proyectado de venta</span><strong>{money(plan.projectedSalePriceUsd, "USD")}</strong><small>{plan.projectedSaleDate ? `Venta estimada: ${shortDate(plan.projectedSaleDate)}` : "Falta definir la fecha"}</small></article>
        </div>
      </section>

      <section className="funding-summary-grid">
        <article><span>Aporte propio</span><strong>{money(plan.ownCapitalUsd, "USD")}</strong></article>
        <article><span>Capital de inversores</span><strong>{money(investorCapital, "USD")}</strong></article>
        <article><span>Ganancia pactada</span><strong>{money(investorProfit, "USD")}</strong></article>
        <article><span>Total a devolver</span><strong>{money(investorCapital + investorProfit, "USD")}</strong></article>
      </section>

      {data.investors.length === 0 ? <EmptyState icon="↗" title="Todavía no hay inversores" copy="Ingresá el nombre, el primer aporte recibido y la ganancia que le vas a pagar." action="Nuevo inversor" onAction={() => { setSelectedInvestorId(""); setModal("investor"); }} /> : <div className="investor-sheet-wrap">
        <table className="investor-sheet">
          <thead><tr><th>Inversor</th><th>Aportes recibidos</th><th className="number-cell">Capital</th><th className="number-cell">Ganancia</th><th className="number-cell">A devolver</th><th className="number-cell">Ganancia %</th><th className="number-cell">Tasa anual</th><th>Acciones</th></tr></thead>
          <tbody>{data.investors.map((investor) => {
            const metrics = investorMetrics(investor, plan.projectedSaleDate);
            return <tr key={investor.id}>
              <td><b>{investor.name}</b></td>
              <td><div className="investor-contribution-list">{investor.contributions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((contribution) => <button type="button" key={contribution.id} title="Editar este aporte" onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(contribution.id); setModal("contribution"); }}><span>{shortDate(contribution.date)}</span><b>{money(contribution.amount, "USD")}</b></button>)}</div></td>
              <td className="number-cell"><b>{money(metrics.capital, "USD")}</b></td>
              <td className="number-cell profit-cell">{money(investor.profitUsd, "USD")}</td>
              <td className="number-cell"><b>{money(metrics.capital + investor.profitUsd, "USD")}</b></td>
              <td className="number-cell">{percent(metrics.totalReturnPercent)}</td>
              <td className="number-cell annual-rate-cell">{metrics.annualRate === null ? "—" : percent(metrics.annualRate)}</td>
              <td><div className="investor-actions"><button className="row-payment-button" onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(""); setModal("contribution"); }}>＋ Aporte</button><button className="mini-button" onClick={() => { setSelectedInvestorId(investor.id); setModal("investor"); }}>Editar</button></div></td>
            </tr>;
          })}</tbody>
        </table>
        <div className="annual-rate-help"><b>¿Cómo se calcula la tasa anual?</b><span>Usa la ganancia pactada, la fecha proyectada de venta y la fecha promedio ponderada de todos los aportes del inversor.</span></div>
      </div>}
    </div>;
  };

  const renderCategories = () => (
    <div className="page-content">
      <PageHeading eyebrow="Organización" title="Categorías y subcategorías" copy="Podés agregar, renombrar o archivar opciones en cualquier momento." />
      <section className="manage-card category-catalog">
        <div className="manage-head"><h2>Categorías de costos</h2><button className="secondary-button" onClick={() => addNamedItem("category")}>＋ Agregar categoría</button></div>
        {categories.map((category) => {
          const linked = subcategoriesFor(category.id);
          return <div className="category-catalog-row" key={category.id}>
            <div className="category-catalog-main">
              <b>{category.name}</b>
              <div className="subcategory-chips">
                {linked.length ? linked.map((subcategory) => <button key={subcategory.id} title="Renombrar subcategoría" onClick={() => renameItem("subcategories", subcategory)}>{subcategory.name}</button>) : <span>Sin subcategorías</span>}
              </div>
            </div>
            <div className="catalog-actions"><button onClick={() => addSubcategoryForCategory(category.id)}>＋ Subcategoría</button><button onClick={() => renameItem("categories", category)}>Renombrar</button><button className="danger" onClick={() => archiveItem("categories", category)}>Archivar</button></div>
          </div>;
        })}
      </section>
      <div className="tip-card"><span>i</span><p><b>“Mano de obra” y “Materiales” se comparten donde corresponde.</b> Si cambiás el nombre de una, se actualiza en todas esas categorías.</p></div>
    </div>
  );

  const approveOffer = (groupId: string, offerId: string) => {
    const group = data.budgetGroups.find((item) => item.id === groupId);
    const offer = group?.offers.find((item) => item.id === offerId);
    if (!group || !offer || group.approvedOfferId) return;
    const expense: Expense = {
      id: uid("exp"), date: offer.date, description: `${group.name} — ${offer.supplier}`,
      categoryId: group.categoryId, subcategoryId: group.subcategoryId, responsible: offer.supplier,
      amount: offer.amount, currency: offer.currency, rate: offer.rate, kind: "approved", budgetGroupId: group.id,
    };
    setData((current) => ({
      ...current,
      budgetGroups: current.budgetGroups.map((item) => item.id === groupId ? { ...item, approvedOfferId: offerId } : item),
      expenses: [...current.expenses, expense],
    }));
    notify("Presupuesto aprobado y agregado a Gastos");
  };

  const renameItem = (collection: "categories" | "subcategories", item: Category) => {
    const name = window.prompt("Nuevo nombre", item.name)?.trim();
    if (!name) return;
    setData((current) => ({ ...current, [collection]: current[collection].map((entry) => entry.id === item.id ? { ...entry, name } : entry) }));
  };
  const archiveItem = (collection: "categories" | "subcategories", item: Category) => {
    if (!window.confirm(`¿Archivar “${item.name}”? Los movimientos existentes conservarán este nombre.`)) return;
    setData((current) => ({ ...current, [collection]: current[collection].map((entry) => entry.id === item.id ? { ...entry, archived: true } : entry) }));
  };

  if (!loaded) return <div className="app-loading"><div className="loading-mark">CO</div><h1>Control de Obra</h1><p>Preparando tus datos…</p></div>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">CO</div><div><b>Control de Obra</b><small>Gestión simple</small></div></div>
        <nav>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-foot"><div className={`sync-dot ${saveStatus}`} /><div><b>{saveStatus === "saved" ? "Todo guardado" : saveStatus === "saving" ? "Guardando…" : "Sin conexión"}</b><small>{saveStatus === "offline" ? "Se reintentará automáticamente" : "Datos protegidos"}</small></div></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark">CO</div><b>Control de Obra</b></div>
          <div className="project-chip"><span>Obra actual</span><b>Casa principal</b></div>
          <button className="rate-chip" onClick={() => setModal("rate")}><span>Dólar oficial</span><b>{money(rate, "ARS")}</b><small>{shortDate(rateDate)} · editar</small></button>
        </header>
        {view === "home" && renderHome()}
        {view === "expenses" && renderExpenses()}
        {view === "payments" && renderPayments()}
        {view === "budgets" && renderBudgets()}
        {view === "investors" && renderInvestors()}
      </section>

      <nav className="bottom-nav">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
      <button className="mobile-fab" aria-label="Ingresar gasto" onClick={() => setModal("expense")}>＋</button>

      {modal === "expense" && <ExpenseModal data={data} rate={rate} expense={data.expenses.find((item) => item.id === selectedExpenseId)} addNamedItem={addNamedItem} addSubcategoryForCategory={addSubcategoryForCategory} close={() => { setModal(null); setSelectedExpenseId(""); }} save={(expense) => {
        setData((current) => ({ ...current, expenses: current.expenses.some((item) => item.id === expense.id) ? current.expenses.map((item) => item.id === expense.id ? expense : item) : [...current.expenses, expense] }));
        setModal(null); setSelectedExpenseId(""); notify("Gasto guardado");
      }} />}
      {modal === "payment" && <PaymentModal data={data} rate={rate} initialExpenseId={selectedExpenseId} remainingForExpense={remainingForExpense} close={() => { setModal(null); setSelectedExpenseId(""); }} save={(payment) => { setData((current) => ({ ...current, payments: [...current.payments, payment] })); setModal(null); setSelectedExpenseId(""); notify("Pago registrado"); }} />}
      {modal === "budget" && <BudgetModal categories={categories} subcategories={subcategories} addNamedItem={addNamedItem} addSubcategoryForCategory={addSubcategoryForCategory} close={() => setModal(null)} save={(group) => { setData((current) => ({ ...current, budgetGroups: [...current.budgetGroups, group] })); setSelectedBudgetId(group.id); setModal("offer"); notify("Comparación creada"); }} />}
      {modal === "offer" && <OfferModal rate={rate} group={data.budgetGroups.find((item) => item.id === selectedBudgetId)} close={() => { setModal(null); setSelectedBudgetId(""); }} save={(offer) => { setData((current) => ({ ...current, budgetGroups: current.budgetGroups.map((group) => group.id === selectedBudgetId ? { ...group, offers: [...group.offers, offer] } : group) })); setModal(null); setSelectedBudgetId(""); notify("Oferta agregada"); }} />}
      {modal === "rate" && <RateModal rate={rate} date={rateDate} source={rateSource} close={() => setModal(null)} save={(nextRate, nextDate) => { setRate(nextRate); setRateDate(nextDate); setRateSource("Cotización ajustada manualmente"); setModal(null); notify("Cotización actualizada"); }} />}
      {modal === "investmentPlan" && <InvestmentPlanModal plan={data.investmentPlan} close={() => setModal(null)} save={(investmentPlan) => { setData((current) => ({ ...current, investmentPlan })); setModal(null); notify("Datos de inversión guardados"); }} />}
      {modal === "investor" && <InvestorModal investor={data.investors.find((item) => item.id === selectedInvestorId)} close={() => { setModal(null); setSelectedInvestorId(""); }} save={(investor) => {
        setData((current) => ({ ...current, investors: current.investors.some((item) => item.id === investor.id) ? current.investors.map((item) => item.id === investor.id ? investor : item) : [...current.investors, investor] }));
        setModal(null); setSelectedInvestorId(""); notify("Inversor guardado");
      }} />}
      {modal === "contribution" && <ContributionModal investor={data.investors.find((item) => item.id === selectedInvestorId)} contribution={data.investors.find((item) => item.id === selectedInvestorId)?.contributions.find((item) => item.id === selectedContributionId)} close={() => { setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); }} save={(contribution) => {
        setData((current) => ({ ...current, investors: current.investors.map((investor) => investor.id === selectedInvestorId ? { ...investor, contributions: investor.contributions.some((item) => item.id === contribution.id) ? investor.contributions.map((item) => item.id === contribution.id ? contribution : item) : [...investor.contributions, contribution] } : investor) }));
        setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); notify("Aporte guardado");
      }} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function PageHeading({ eyebrow, title, copy, action, onAction }: { eyebrow: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action && <button className="primary-button large" onClick={onAction}>＋ {action}</button>}</header>;
}

function EmptyState({ icon, title, copy, action, onAction }: { icon: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{copy}</p>{action && <button className="primary-button" onClick={onAction}>＋ {action}</button>}</div>;
}

function KindBadge({ kind }: { kind: ExpenseKind }) {
  return <span className={`kind-badge ${kind}`}>{kind === "approved" ? "Presupuesto aprobado" : kind === "additional" ? "Gasto adicional" : "Gasto"}</span>;
}

function CategorySelect({ label, value, setValue, items, onNew }: { label: string; value: string; setValue: (value: string) => void; items: Category[]; onNew: () => string }) {
  return <label><span>{label}</span><select required value={value} onChange={(event) => { if (event.target.value === "__new") { const id = onNew(); if (id) setValue(id); } else setValue(event.target.value); }}><option value="">Elegir…</option>{items.filter((item) => !item.archived).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}<option value="__new">＋ Crear nueva</option></select></label>;
}

function SubcategorySelect({ categoryId, value, setValue, categories, subcategories, onNew }: { categoryId: string; value: string; setValue: (value: string) => void; categories: Category[]; subcategories: Subcategory[]; onNew: () => string }) {
  const available = linkedSubcategories(categoryId, categories, subcategories);
  const hasOptions = available.length > 0;
  return <label><span>Subcategoría</span><select required={hasOptions} disabled={!categoryId} value={value} onChange={(event) => { if (event.target.value === "__new") { const id = onNew(); if (id) setValue(id); } else setValue(event.target.value); }}>
    <option value="">{!categoryId ? "Primero elegí una categoría" : hasOptions ? "Elegir…" : "No corresponde"}</option>
    {available.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
    {categoryId && <option value="__new">＋ Crear nueva</option>}
  </select></label>;
}

function ExpenseModal({ data, rate, expense, addNamedItem, addSubcategoryForCategory, close, save }: { data: AppState; rate: number; expense?: Expense; addNamedItem: (kind: "category" | "subcategory") => string; addSubcategoryForCategory: (categoryId: string) => string; close: () => void; save: (expense: Expense) => void }) {
  const [date, setDate] = useState(expense?.date ?? today());
  const [description, setDescription] = useState(expense?.description ?? "");
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(expense?.subcategoryId ?? "");
  const [responsible, setResponsible] = useState(expense?.responsible ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState<Currency>(expense?.currency ?? "USD");
  const selectedRate = expense?.rate ?? rate;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (Number(amount) <= 0) return;
    save({ id: expense?.id ?? uid("exp"), date, description: description.trim(), categoryId, subcategoryId, responsible: responsible.trim(), amount: Number(amount), currency, rate: selectedRate, kind: expense?.kind ?? "manual", budgetGroupId: expense?.budgetGroupId });
  };
  return <Modal title={expense ? "Editar gasto" : "Ingresar gasto"} close={close} wide><form className="form-grid" onSubmit={submit}>
    <CategorySelect label="Categoría" value={categoryId} setValue={(value) => { setCategoryId(value); setSubcategoryId(""); }} items={data.categories} onNew={() => addNamedItem("category")} />
    <SubcategorySelect categoryId={categoryId} value={subcategoryId} setValue={setSubcategoryId} categories={data.categories} subcategories={data.subcategories} onNew={() => addSubcategoryForCategory(categoryId)} />
    <label className="span-2"><span>Descripción del gasto (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: compra de grifería" /></label>
    <label><span>Fecha</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Responsable (opcional)</span><input value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Arquitecto, albañil…" /></label>
    <div className="amount-field span-2"><span>Monto</span><div className="amount-control"><CurrencyFields currency={currency} setCurrency={setCurrency} /><label className="amount-input"><span>{currency === "USD" ? "US$" : "$"}</span><FormattedAmountInput ariaLabel={`Monto en ${currency}`} required value={amount} setValue={setAmount} placeholder={currency} /></label></div></div>
    {amount && <div className="conversion-note span-2">Equivale a <b>{currency === "ARS" ? money(Number(amount) / selectedRate, "USD") : money(Number(amount) * selectedRate, "ARS")}</b> usando dólar {money(selectedRate, "ARS")}.</div>}
    <FormActions close={close} label={expense ? "Guardar cambios" : "Guardar gasto"} />
  </form></Modal>;
}

function InlinePaymentForm({ expense, rate, remaining, close, save }: { expense: Expense; rate: number; remaining: number; close: () => void; save: (payment: Payment) => void }) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(expense.currency);
  const maxAmount = currency === expense.currency
    ? remaining
    : expense.currency === "ARS"
      ? remaining / rate
      : remaining * rate;
  const debitAmount = expense.currency === currency
    ? Number(amount)
    : expense.currency === "ARS"
      ? Number(amount) * rate
      : Number(amount) / rate;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!amount || Number(amount) <= 0 || Number(amount) > maxAmount + 0.005) return;
    save({ id: uid("pay"), expenseId: expense.id, date, description: description.trim(), amount: Number(amount), currency, rate });
  };

  return <div className="inline-payment-panel">
    <div className="inline-payment-head">
      <div><span>Pago para este gasto</span><strong>{expense.description || "Gasto sin descripción"}</strong><small>Saldo pendiente: {money(remaining, expense.currency)}</small></div>
      <button type="button" className="icon-button" onClick={close} aria-label="Cerrar pago">×</button>
    </div>
    {remaining <= 0.005 ? <div className="inline-payment-complete"><span>✓</span><div><b>Este gasto ya está pagado.</b><small>No tiene saldo pendiente.</small></div></div> : <form className="inline-payment-form" onSubmit={submit}>
      <label><span>Fecha del pago</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="amount-field"><span>Monto pagado</span><div className="amount-control"><CurrencyFields currency={currency} setCurrency={(value) => { setCurrency(value); setAmount(""); }} /><label className="amount-input"><span>{currency === "USD" ? "US$" : "$"}</span><FormattedAmountInput ariaLabel={`Monto pagado en ${currency}`} required invalid={Number(amount) > maxAmount + 0.005} value={amount} setValue={setAmount} placeholder={currency} /></label></div></div>
      <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: transferencia parcial" /></label>
      <button className="primary-button inline-payment-submit" type="submit">Guardar pago</button>
      {amount && Number(amount) > 0 && <div className={`inline-payment-note ${Number(amount) > maxAmount + 0.005 ? "error" : ""}`}>{Number(amount) > maxAmount + 0.005 ? <>El monto supera el saldo. El máximo es <b>{money(maxAmount, currency)}</b>.</> : <>Se descontarán <b>{money(debitAmount, expense.currency)}</b> del saldo.</>}</div>}
    </form>}
  </div>;
}

function PaymentModal({ data, rate, initialExpenseId, remainingForExpense, close, save }: { data: AppState; rate: number; initialExpenseId: string; remainingForExpense: (expense: Expense) => number; close: () => void; save: (payment: Payment) => void }) {
  const [expenseId, setExpenseId] = useState(initialExpenseId);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const expense = data.expenses.find((item) => item.id === expenseId);
  const submit = (event: FormEvent) => { event.preventDefault(); if (Number(amount) <= 0) return; save({ id: uid("pay"), expenseId, date, description: description.trim(), amount: Number(amount), currency, rate }); };
  return <Modal title="Registrar pago" close={close}><form className="form-grid" onSubmit={submit}>
    <label className="span-2"><span>Gasto a pagar</span><select required value={expenseId} onChange={(event) => setExpenseId(event.target.value)}><option value="">Elegir gasto…</option>{data.expenses.filter((item) => remainingForExpense(item) > 0.005).map((item) => <option value={item.id} key={item.id}>{item.description} · resta {money(remainingForExpense(item), item.currency)}</option>)}</select></label>
    <label><span>Fecha del pago</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: transferencia parcial" /></label>
    <label><span>Monto pagado</span><FormattedAmountInput required value={amount} setValue={setAmount} /></label>
    <div className="field"><span>Moneda del pago</span><CurrencyFields currency={currency} setCurrency={setCurrency} /></div>
    {expense && amount && <div className="conversion-note span-2">Se descontarán <b>{expense.currency === currency ? money(Number(amount), expense.currency) : expense.currency === "ARS" ? money(Number(amount) * rate, "ARS") : money(Number(amount) / rate, "USD")}</b> del saldo, con la cotización de hoy.</div>}
    <FormActions close={close} label="Guardar pago" />
  </form></Modal>;
}

function ProgressModal({ categories, subcategories, addSubcategoryForCategory, close, save }: { categories: Category[]; subcategories: Subcategory[]; addSubcategoryForCategory: (categoryId: string) => string; close: () => void; save: (item: ProgressItem) => void }) {
  const [categoryId, setCategoryId] = useState(""); const [subcategoryId, setSubcategoryId] = useState(""); const [percent, setPercent] = useState(0);
  return <Modal title="Actualizar avance" close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save({ id: uid("prog"), categoryId, subcategoryId, percent }); }}>
    <label><span>Categoría</span><select required value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(""); }}><option value="">Elegir…</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <SubcategorySelect categoryId={categoryId} value={subcategoryId} setValue={setSubcategoryId} categories={categories} subcategories={subcategories} onNew={() => addSubcategoryForCategory(categoryId)} />
    <div className="range-field span-2"><div><span>Porcentaje avanzado</span><strong>{percent}%</strong></div><input className="range" type="range" min="0" max="100" step="5" value={percent} onChange={(event) => setPercent(Number(event.target.value))} /></div>
    <FormActions close={close} label="Guardar avance" />
  </form></Modal>;
}

function BudgetModal({ categories, subcategories, addNamedItem, addSubcategoryForCategory, close, save }: { categories: Category[]; subcategories: Subcategory[]; addNamedItem: (kind: "category" | "subcategory") => string; addSubcategoryForCategory: (categoryId: string) => string; close: () => void; save: (group: BudgetGroup) => void }) {
  const [name, setName] = useState(""); const [categoryId, setCategoryId] = useState(""); const [subcategoryId, setSubcategoryId] = useState("");
  return <Modal title="Nueva comparación" close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save({ id: uid("budget"), name: name.trim(), categoryId, subcategoryId, offers: [] }); }}>
    <label className="span-2"><span>¿Qué querés comparar?</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: sanitarios para el baño" /></label>
    <CategorySelect label="Categoría" value={categoryId} setValue={(value) => { setCategoryId(value); setSubcategoryId(""); }} items={categories} onNew={() => addNamedItem("category")} />
    <SubcategorySelect categoryId={categoryId} value={subcategoryId} setValue={setSubcategoryId} categories={categories} subcategories={subcategories} onNew={() => addSubcategoryForCategory(categoryId)} />
    <FormActions close={close} label="Crear y agregar oferta" />
  </form></Modal>;
}

function OfferModal({ rate, group, close, save }: { rate: number; group?: BudgetGroup; close: () => void; save: (offer: BudgetOffer) => void }) {
  const [supplier, setSupplier] = useState(""); const [date, setDate] = useState(today()); const [description, setDescription] = useState(""); const [amount, setAmount] = useState(""); const [currency, setCurrency] = useState<Currency>("ARS");
  if (!group) return null;
  return <Modal title={`Agregar oferta · ${group.name}`} close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (Number(amount) <= 0) return; save({ id: uid("offer"), supplier: supplier.trim(), date, description: description.trim(), amount: Number(amount), currency, rate }); }}>
    <label className="span-2"><span>Proveedor o empresa</span><input required value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Nombre del proveedor" /></label>
    <label><span>Fecha</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle breve" /></label>
    <label><span>Monto total</span><FormattedAmountInput required value={amount} setValue={setAmount} /></label>
    <div className="field"><span>Moneda</span><CurrencyFields currency={currency} setCurrency={setCurrency} /></div>
    {amount && <div className="conversion-note span-2">Equivale a <b>{currency === "ARS" ? money(Number(amount) / rate, "USD") : money(Number(amount) * rate, "ARS")}</b>.</div>}
    <FormActions close={close} label="Guardar oferta" />
  </form></Modal>;
}

function InvestmentPlanModal({ plan, close, save }: { plan: InvestmentPlan; close: () => void; save: (plan: InvestmentPlan) => void }) {
  const [propertyValue, setPropertyValue] = useState(plan.propertyValueUsd ? plan.propertyValueUsd.toString() : "");
  const [ownCapital, setOwnCapital] = useState(plan.ownCapitalUsd ? plan.ownCapitalUsd.toString() : "");
  const [remodelBudget, setRemodelBudget] = useState(plan.remodelBudgetUsd ? plan.remodelBudgetUsd.toString() : "");
  const [salePrice, setSalePrice] = useState(plan.projectedSalePriceUsd ? plan.projectedSalePriceUsd.toString() : "");
  const [saleDate, setSaleDate] = useState(plan.projectedSaleDate);
  return <Modal title="Datos de la inversión" close={close} wide><form className="form-grid" onSubmit={(event) => {
    event.preventDefault();
    save({ propertyValueUsd: Number(propertyValue) || 0, ownCapitalUsd: Number(ownCapital) || 0, remodelBudgetUsd: Number(remodelBudget) || 0, projectedSalePriceUsd: Number(salePrice) || 0, projectedSaleDate: saleDate });
  }}>
    <label><span>Valor de la propiedad (USD)</span><FormattedAmountInput value={propertyValue} setValue={setPropertyValue} placeholder="USD" /></label>
    <label><span>Aporte propio (USD)</span><FormattedAmountInput value={ownCapital} setValue={setOwnCapital} placeholder="USD" /></label>
    <label><span>Presupuesto remodelación (USD)</span><FormattedAmountInput value={remodelBudget} setValue={setRemodelBudget} placeholder="USD" /></label>
    <label><span>Precio proyectado de venta (USD)</span><FormattedAmountInput value={salePrice} setValue={setSalePrice} placeholder="USD" /></label>
    <label className="span-2"><span>Fecha proyectada de venta</span><input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} /></label>
    <div className="source-note span-2"><span>Dato automático</span><b>Los gastos reales de remodelación se calculan desde la pantalla Gastos.</b></div>
    <FormActions close={close} label="Guardar valores" />
  </form></Modal>;
}

function InvestorModal({ investor, close, save }: { investor?: Investor; close: () => void; save: (investor: Investor) => void }) {
  const [name, setName] = useState(investor?.name ?? "");
  const [profit, setProfit] = useState(investor?.profitUsd ? investor.profitUsd.toString() : "");
  const [firstDate, setFirstDate] = useState(today());
  const [firstAmount, setFirstAmount] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || Number(profit) < 0 || (!investor && Number(firstAmount) <= 0)) return;
    save({
      id: investor?.id ?? uid("investor"),
      name: name.trim(),
      profitUsd: Number(profit) || 0,
      contributions: investor?.contributions ?? [{ id: uid("contribution"), date: firstDate, amount: Number(firstAmount) }],
    });
  };
  return <Modal title={investor ? "Editar inversor" : "Nuevo inversor"} close={close}><form className="form-grid" onSubmit={submit}>
    <label className="span-2"><span>Nombre del inversor</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" /></label>
    {!investor && <><label><span>Fecha del primer aporte</span><input required type="date" value={firstDate} onChange={(event) => setFirstDate(event.target.value)} /></label><label><span>Primer aporte (USD)</span><FormattedAmountInput required value={firstAmount} setValue={setFirstAmount} placeholder="USD" /></label></>}
    <label className="span-2"><span>Ganancia acordada para el inversor (USD)</span><FormattedAmountInput required value={profit} setValue={setProfit} placeholder="USD" /></label>
    <div className="conversion-note span-2">La devolución total será el <b>capital recibido más esta ganancia</b>.</div>
    {investor && <div className="source-note span-2"><span>Aportes</span><b>Las fechas y los montos se editan directamente desde la grilla de inversores.</b></div>}
    <FormActions close={close} label={investor ? "Guardar cambios" : "Guardar inversor"} />
  </form></Modal>;
}

function ContributionModal({ investor, contribution, close, save }: { investor?: Investor; contribution?: InvestorContribution; close: () => void; save: (contribution: InvestorContribution) => void }) {
  const [date, setDate] = useState(contribution?.date ?? today());
  const [amount, setAmount] = useState(contribution?.amount ? contribution.amount.toString() : "");
  if (!investor) return null;
  return <Modal title={`${contribution ? "Editar" : "Agregar"} aporte · ${investor.name}`} close={close}><form className="form-grid" onSubmit={(event) => {
    event.preventDefault();
    if (Number(amount) <= 0) return;
    save({ id: contribution?.id ?? uid("contribution"), date, amount: Number(amount) });
  }}>
    <label><span>Fecha en que entregó el dinero</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Monto recibido (USD)</span><FormattedAmountInput required value={amount} setValue={setAmount} placeholder="USD" /></label>
    <FormActions close={close} label="Guardar aporte" />
  </form></Modal>;
}

function RateModal({ rate, date, source, close, save }: { rate: number; date: string; source: string; close: () => void; save: (rate: number, date: string) => void }) {
  const [nextRate, setNextRate] = useState(rate.toString()); const [nextDate, setNextDate] = useState(date);
  return <Modal title="Cotización del dólar" close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (Number(nextRate) < 1) return; save(Number(nextRate), nextDate); }}>
    <div className="source-note span-2"><span>Fuente actual</span><b>{source}</b><small>La aplicación consulta automáticamente el promedio vendedor del BCRA.</small></div>
    <label><span>Pesos por dólar</span><FormattedAmountInput required value={nextRate} setValue={setNextRate} /></label>
    <label><span>Fecha de cotización</span><input required type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label>
    <FormActions close={close} label="Usar esta cotización" />
  </form></Modal>;
}

function FormActions({ close, label }: { close: () => void; label: string }) {
  return <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button type="submit" className="primary-button">{label}</button></div>;
}
