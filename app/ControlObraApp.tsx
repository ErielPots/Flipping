"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

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
type AppState = {
  catalogVersion?: number;
  categories: Category[];
  subcategories: Subcategory[];
  expenses: Expense[];
  payments: Payment[];
  progress: ProgressItem[];
  budgetGroups: BudgetGroup[];
};
type View = "home" | "expenses" | "payments" | "progress" | "budgets" | "categories";
type ModalName = "expense" | "payment" | "progress" | "budget" | "offer" | "rate" | null;

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
};

function normalizeState(candidate: AppState | undefined): AppState {
  if (!candidate?.categories || !candidate?.subcategories) return initialState;
  if ((candidate.catalogVersion ?? 0) >= 2) return candidate;

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
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
const toArs = (amount: number, currency: Currency, rate: number) =>
  currency === "ARS" ? amount : amount * rate;
const toUsd = (amount: number, currency: Currency, rate: number) =>
  currency === "USD" ? amount : amount / rate;
const linkedSubcategories = (categoryId: string, categories: Category[], subcategories: Subcategory[]) => {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return [];
  if (!Array.isArray(category.subcategoryIds)) return subcategories.filter((item) => !item.archived);
  return subcategories.filter((item) => !item.archived && category.subcategoryIds?.includes(item.id));
};

const nav: Array<{ id: View; label: string; icon: string }> = [
  { id: "home", label: "Resumen", icon: "⌂" },
  { id: "expenses", label: "Gastos", icon: "$" },
  { id: "payments", label: "Pagos", icon: "✓" },
  { id: "budgets", label: "Presupuestos", icon: "≡" },
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
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
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
      <PageHeading eyebrow="Movimientos" title="Gastos" copy="Una grilla simple con todos los gastos de la obra." action="Ingresar gasto" onAction={() => setModal("expense")} />
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
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Subcategoría</th><th>Descripción</th><th>Responsable</th><th className="number-cell">Monto</th><th className="number-cell">Pagado</th><th className="number-cell">Saldo</th><th aria-label="Acciones" /></tr></thead>
            <tbody>{filteredExpenses.map((expense) => {
              const paid = paymentForExpense(expense);
              const remaining = remainingForExpense(expense);
              return <tr key={expense.id}>
                <td className="date-cell">{shortDate(expense.date)}</td>
                <td><b>{categoryName(expense.categoryId)}</b></td>
                <td>{subcategoryName(expense.subcategoryId) || "—"}</td>
                <td>{expense.description || "—"}</td>
                <td>{expense.responsible || "—"}</td>
                <td className="number-cell"><b>{money(expense.amount, expense.currency)}</b></td>
                <td className="number-cell paid-cell">{money(paid, expense.currency)}</td>
                <td className="number-cell balance-cell">{money(remaining, expense.currency)}</td>
                <td><button className="mini-button" onClick={() => { setSelectedExpenseId(expense.id); setModal("expense"); }}>Editar</button></td>
              </tr>;
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
    save({ id: expense?.id ?? uid("exp"), date, description: description.trim(), categoryId, subcategoryId, responsible: responsible.trim(), amount: Number(amount), currency, rate: selectedRate, kind: expense?.kind ?? "manual", budgetGroupId: expense?.budgetGroupId });
  };
  return <Modal title={expense ? "Editar gasto" : "Ingresar gasto"} close={close} wide><form className="form-grid" onSubmit={submit}>
    <CategorySelect label="Categoría" value={categoryId} setValue={(value) => { setCategoryId(value); setSubcategoryId(""); }} items={data.categories} onNew={() => addNamedItem("category")} />
    <SubcategorySelect categoryId={categoryId} value={subcategoryId} setValue={setSubcategoryId} categories={data.categories} subcategories={data.subcategories} onNew={() => addSubcategoryForCategory(categoryId)} />
    <label className="span-2"><span>Descripción del gasto (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: compra de grifería" /></label>
    <label><span>Fecha</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Responsable (opcional)</span><input value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Arquitecto, albañil…" /></label>
    <div className="amount-field span-2"><span>Monto</span><div className="amount-control"><CurrencyFields currency={currency} setCurrency={setCurrency} /><label className="amount-input"><span>{currency === "USD" ? "US$" : "$"}</span><input aria-label={`Monto en ${currency}`} required min="0.01" step="0.01" inputMode="decimal" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={currency} /></label></div></div>
    {amount && <div className="conversion-note span-2">Equivale a <b>{currency === "ARS" ? money(Number(amount) / selectedRate, "USD") : money(Number(amount) * selectedRate, "ARS")}</b> usando dólar {money(selectedRate, "ARS")}.</div>}
    <FormActions close={close} label={expense ? "Guardar cambios" : "Guardar gasto"} />
  </form></Modal>;
}

function PaymentModal({ data, rate, initialExpenseId, remainingForExpense, close, save }: { data: AppState; rate: number; initialExpenseId: string; remainingForExpense: (expense: Expense) => number; close: () => void; save: (payment: Payment) => void }) {
  const [expenseId, setExpenseId] = useState(initialExpenseId);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const expense = data.expenses.find((item) => item.id === expenseId);
  const submit = (event: FormEvent) => { event.preventDefault(); save({ id: uid("pay"), expenseId, date, description: description.trim(), amount: Number(amount), currency, rate }); };
  return <Modal title="Registrar pago" close={close}><form className="form-grid" onSubmit={submit}>
    <label className="span-2"><span>Gasto a pagar</span><select required value={expenseId} onChange={(event) => setExpenseId(event.target.value)}><option value="">Elegir gasto…</option>{data.expenses.filter((item) => remainingForExpense(item) > 0.005).map((item) => <option value={item.id} key={item.id}>{item.description} · resta {money(remainingForExpense(item), item.currency)}</option>)}</select></label>
    <label><span>Fecha del pago</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: transferencia parcial" /></label>
    <label><span>Monto pagado</span><input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
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
  return <Modal title={`Agregar oferta · ${group.name}`} close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save({ id: uid("offer"), supplier: supplier.trim(), date, description: description.trim(), amount: Number(amount), currency, rate }); }}>
    <label className="span-2"><span>Proveedor o empresa</span><input required value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Nombre del proveedor" /></label>
    <label><span>Fecha</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle breve" /></label>
    <label><span>Monto total</span><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
    <div className="field"><span>Moneda</span><CurrencyFields currency={currency} setCurrency={setCurrency} /></div>
    {amount && <div className="conversion-note span-2">Equivale a <b>{currency === "ARS" ? money(Number(amount) / rate, "USD") : money(Number(amount) * rate, "ARS")}</b>.</div>}
    <FormActions close={close} label="Guardar oferta" />
  </form></Modal>;
}

function RateModal({ rate, date, source, close, save }: { rate: number; date: string; source: string; close: () => void; save: (rate: number, date: string) => void }) {
  const [nextRate, setNextRate] = useState(rate.toString()); const [nextDate, setNextDate] = useState(date);
  return <Modal title="Cotización del dólar" close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save(Number(nextRate), nextDate); }}>
    <div className="source-note span-2"><span>Fuente actual</span><b>{source}</b><small>La aplicación consulta automáticamente el promedio vendedor del BCRA.</small></div>
    <label><span>Pesos por dólar</span><input required type="number" min="1" step="0.01" value={nextRate} onChange={(event) => setNextRate(event.target.value)} /></label>
    <label><span>Fecha de cotización</span><input required type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label>
    <FormActions close={close} label="Usar esta cotización" />
  </form></Modal>;
}

function FormActions({ close, label }: { close: () => void; label: string }) {
  return <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button type="submit" className="primary-button">{label}</button></div>;
}
