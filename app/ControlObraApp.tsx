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
type InvestorContribution = { id: string; date: string; amount: number; currency?: Currency; rate?: number };
type Investor = {
  id: string;
  name: string;
  profitUsd: number;
  profitAmount?: number;
  profitCurrency?: Currency;
  profitRate?: number;
  contributions: InvestorContribution[];
};
type InvestmentPlan = {
  propertyValueUsd: number;
  propertyCommissionPercent: number;
  ownCapitalUsd: number;
  ownCapitalManual: boolean;
  remodelBudgetUsd: number;
  projectedSalePriceUsd: number;
  purchaseDate: string;
  projectedSaleDate: string;
};
type ExchangeRateRecord = { date: string; rate: number; source: string };
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
  exchangeRateHistory?: ExchangeRateRecord[];
};
type View = "home" | "expenses" | "progress" | "budgets" | "categories" | "investors";
type ModalName = "expense" | "payment" | "progress" | "budget" | "offer" | "rate" | "investor" | "contribution" | "investmentPlan" | null;

const emptyInvestmentPlan: InvestmentPlan = {
  propertyValueUsd: 0,
  propertyCommissionPercent: 3,
  ownCapitalUsd: 0,
  ownCapitalManual: false,
  remodelBudgetUsd: 0,
  projectedSalePriceUsd: 0,
  purchaseDate: "",
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
const defaultCategoryIds = new Set(defaultCategories.map((item) => item.id));
const defaultSubcategoryIds = new Set(defaultSubcategories.map((item) => item.id));

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
  exchangeRateHistory: [],
};

function normalizeState(candidate: AppState | undefined): AppState {
  if (!candidate?.categories || !candidate?.subcategories) return initialState;
  const savedPlan = candidate.investmentPlan;
  const investmentState = {
    investors: Array.isArray(candidate.investors) ? candidate.investors.map((investor) => ({
      ...investor,
      profitAmount: investor.profitAmount ?? investor.profitUsd,
      profitCurrency: investor.profitCurrency ?? "USD",
      profitRate: investor.profitRate ?? 1500,
      contributions: (investor.contributions ?? []).map((contribution) => ({ ...contribution, currency: contribution.currency ?? "USD", rate: contribution.rate ?? 1500 })),
    })) : [],
    investmentPlan: {
      ...emptyInvestmentPlan,
      ...(savedPlan ?? {}),
      propertyCommissionPercent: Number.isFinite(savedPlan?.propertyCommissionPercent) ? savedPlan.propertyCommissionPercent : 3,
      ownCapitalManual: savedPlan?.ownCapitalManual ?? Boolean(savedPlan?.ownCapitalUsd),
    },
    exchangeRateHistory: Array.isArray(candidate.exchangeRateHistory)
      ? candidate.exchangeRateHistory.filter((item) => item?.date && Number.isFinite(item?.rate))
      : [],
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
const propertyCostWithCommission = (propertyValueUsd: number, commissionPercent = 3) => propertyValueUsd * (1 + commissionPercent / 100);
const updateRateHistory = (history: ExchangeRateRecord[], next: ExchangeRateRecord) => [
  ...history.filter((item) => item.date !== next.date),
  { ...next, date: next.date.slice(0, 10) },
].sort((left, right) => right.date.localeCompare(left.date));
const percent = (value: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)}%`;
const contributionInUsd = (contribution: InvestorContribution) => toUsd(contribution.amount, contribution.currency ?? "USD", contribution.rate ?? 1500);
const investorMetrics = (investor: Investor, projectedSaleDate: string) => {
  const capital = investor.contributions.reduce((sum, item) => sum + contributionInUsd(item), 0);
  const totalReturnPercent = capital ? (investor.profitUsd / capital) * 100 : 0;
  if (!capital) return { capital, totalReturnPercent, annualRate: null as number | null, termDays: null as number | null, annualRateStatus: "Sin capital" };
  if (!projectedSaleDate) return { capital, totalReturnPercent, annualRate: null as number | null, termDays: null as number | null, annualRateStatus: "Falta fecha de venta" };
  const weightedContributionTime = investor.contributions.reduce((sum, item) => sum + new Date(`${item.date}T12:00:00`).getTime() * contributionInUsd(item), 0) / capital;
  const saleTime = new Date(`${projectedSaleDate}T12:00:00`).getTime();
  const days = (saleTime - weightedContributionTime) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return { capital, totalReturnPercent, annualRate: null as number | null, termDays: null as number | null, annualRateStatus: "Revisar fechas" };
  const annualRate = totalReturnPercent * (365 / days);
  return { capital, totalReturnPercent, annualRate: Number.isFinite(annualRate) ? annualRate : null, termDays: days, annualRateStatus: "Calculada" };
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

function DateInput({ value, setValue, required = false, ariaLabel }: { value: string; setValue: (value: string) => void; required?: boolean; ariaLabel?: string }) {
  const isToday = value === today();
  return <span className={`date-input ${isToday ? "is-today" : ""}`}><input aria-label={ariaLabel} required={required} type="date" value={value} onChange={(event) => setValue(event.target.value)} />{isToday && <span className="date-today-label">Hoy</span>}</span>;
}

type IconName = "home" | "expenses" | "budgets" | "investors";
const iconPaths: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  expenses: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  budgets: <><path d="M9 4h6v3H9z" /><path d="M7 5H5v16h14V5h-2" /><path d="M8.5 12h7M8.5 16h4.5" /></>,
  investors: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.5c2.4.2 4.2 1.9 5 5" /></>,
};

function NavIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const nav: Array<{ id: View; label: string; icon: IconName }> = [
  { id: "home", label: "Resumen", icon: "home" },
  { id: "expenses", label: "Costos", icon: "expenses" },
  { id: "budgets", label: "Presupuestos", icon: "budgets" },
  { id: "investors", label: "Inversores", icon: "investors" },
];

function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
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
      <button type="button" className={`currency-ars ${currency === "ARS" ? "active" : ""}`} onClick={() => setCurrency("ARS")}>ARS</button>
      <button type="button" className={`currency-usd ${currency === "USD" ? "active" : ""}`} onClick={() => setCurrency("USD")}>USD</button>
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
  const [expandedInvestorId, setExpandedInvestorId] = useState<string>("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>("all");
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [investmentField, setInvestmentField] = useState<"property" | "remodel" | "sale">("property");
  const [rate, setRate] = useState(1500);
  const [rateDate, setRateDate] = useState(today());
  const [rateSource, setRateSource] = useState("Cotización manual");
  const [saveStatus, setSaveStatus] = useState<"loading" | "saved" | "saving" | "offline">("loading");
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/state").then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/exchange-rate").then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/exchange-rate-history").then((response) => response.ok ? response.json() : Promise.resolve({ history: [] })),
    ])
      .then(([stateResult, rateResult, historyResult]) => {
        const savedState = normalizeState(stateResult.state);
        const nextRate = Number(rateResult.rate) || 1500;
        const nextDate = (rateResult.date ?? today()).slice(0, 10);
        const nextSource = rateResult.source ?? "Dólar oficial · promedio compra/venta";
        const downloadedHistory = Array.isArray(historyResult.history) ? historyResult.history as ExchangeRateRecord[] : [];
        const importedHistory = downloadedHistory.reduce((current, item) => updateRateHistory(current, item), [] as ExchangeRateRecord[]);
        const manualHistory = (savedState.exchangeRateHistory ?? []).filter((item) => item.source === "Cotización ajustada manualmente");
        const withManualAdjustments = manualHistory.reduce((current, item) => updateRateHistory(current, item), importedHistory);
        const updatedHistory = updateRateHistory(withManualAdjustments, { date: nextDate, rate: nextRate, source: nextSource });
        setData({ ...savedState, exchangeRateHistory: updatedHistory });
        setRate(nextRate);
        setRateDate(nextDate);
        setRateSource(nextSource);
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

  useEffect(() => {
    setExpandedExpenseId("");
    setExpandedInvestorId("");
  }, [view]);

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
  const investorCapitalTotal = data.investors.reduce((sum, investor) => sum + investor.contributions.reduce((contributionSum, contribution) => contributionSum + contributionInUsd(contribution), 0), 0);
  const selectedInvestor = data.investors.find((item) => item.id === selectedInvestorId);
  const selectedContribution = selectedInvestor?.contributions.find((item) => item.id === selectedContributionId);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
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

  const deleteExpense = (expense: Expense) => {
    const relatedPayments = data.payments.filter((payment) => payment.expenseId === expense.id);
    const detail = relatedPayments.length ? ` También se eliminarán ${relatedPayments.length} pago${relatedPayments.length === 1 ? "" : "s"} registrado${relatedPayments.length === 1 ? "" : "s"}.` : "";
    if (!window.confirm(`¿Eliminar este costo? Esta acción no se puede deshacer.${detail}`)) return;
    setData((current) => ({
      ...current,
      expenses: current.expenses.filter((item) => item.id !== expense.id),
      payments: current.payments.filter((payment) => payment.expenseId !== expense.id),
    }));
    setExpandedExpenseId("");
    notify("Costo eliminado");
  };

  const deletePayment = (payment: Payment) => {
    if (!window.confirm(`¿Eliminar el pago de ${money(payment.amount, payment.currency)} del ${shortDate(payment.date)}? Esta acción no se puede deshacer.`)) return;
    setData((current) => ({ ...current, payments: current.payments.filter((item) => item.id !== payment.id) }));
    notify("Pago eliminado");
  };

  const openPaymentModal = () => {
    if (!data.expenses.some((expense) => remainingForExpense(expense) > 0.005)) {
      notify("No hay costos con saldo pendiente");
      return;
    }
    setModal("payment");
  };

  const renderHome = () => (
    <div className="page-content home-view">
      <header className="simple-heading">
        <h1>Resumen</h1>
        <div className="heading-actions">
          <button className="secondary-button large" onClick={openPaymentModal}>Registrar pago</button>
          <button className="primary-button large" onClick={() => setModal("expense")}>＋ Ingresar costo</button>
        </div>
      </header>

      <section className="summary-grid">
        <article className="summary-card">
          <span>Costo total de la obra</span>
          <strong>{money(totals.committedArs, "ARS")}</strong>
          <small>{money(totals.committedUsd, "USD")}</small>
        </article>
        <article className="summary-card paid">
          <span>Pagado</span>
          <strong>{money(totals.paidArs, "ARS")}</strong>
          <small>{money(totals.paidUsd, "USD")}</small>
        </article>
        <article className="summary-card pending">
          <span>Falta pagar</span>
          <strong>{money(totals.remainingArs, "ARS")}</strong>
          <small>{money(totals.remainingUsd, "USD")}</small>
        </article>
      </section>

      <section className="panel payment-panel">
        <div className="panel-head">
          <h2>Avance de pagos</h2>
          <strong className="big-percent">{Math.round(totals.paidPercent)}%</strong>
        </div>
        <ProgressBar value={totals.paidPercent} tone="green" />
        <p className="panel-note">{data.expenses.length ? "Porcentaje pagado sobre el total de costos cargados." : "Cuando cargues costos y pagos, acá vas a ver cuánto se lleva pagado."}</p>
        <button className="text-button" onClick={() => setView("expenses")}>Ver todos los costos →</button>
      </section>
    </div>
  );

  const renderExpenses = () => {
    const isPending = (expense: Expense) => remainingForExpense(expense) > 0.005;
    const pendingCount = data.expenses.filter(isPending).length;
    const filteredExpenses = data.expenses
      .filter((expense) => expenseCategoryFilter === "all" || (expenseCategoryFilter === "pending" ? isPending(expense) : expense.categoryId === expenseCategoryFilter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const remodelBudget = data.investmentPlan.remodelBudgetUsd;
    const remodelDifference = totals.committedUsd - remodelBudget;
    const toggleExpense = (expense: Expense) => setExpandedExpenseId((current) => current === expense.id ? "" : expense.id);
    const expenseDetails = (expense: Expense, remaining: number) => <InlinePaymentForm
      expense={expense}
      rate={rate}
      remaining={remaining}
      payments={data.payments.filter((payment) => payment.expenseId === expense.id)}
      removePayment={deletePayment}
      edit={() => { setSelectedExpenseId(expense.id); setModal("expense"); }}
      remove={() => deleteExpense(expense)}
      save={(payment) => {
        setData((current) => ({ ...current, payments: [...current.payments, payment] }));
        notify("Pago registrado");
      }}
    />;
    const balanceLabel = (expense: Expense, remaining: number) => remaining > 0.005
      ? <span className="balance">Falta {money(remaining, expense.currency)}</span>
      : <span className="paid">✓ Pagado</span>;

    return <div className="page-content">
      <SimpleHeading title="Costos" action="Ingresar costo" onAction={() => setModal("expense")} />
      {remodelBudget > 0 && <p className={`budget-line ${remodelDifference > 0.005 ? "over" : ""}`}>
        Presupuesto proyectado <b>{money(remodelBudget, "USD")}</b> · Gastado <b>{money(totals.committedUsd, "USD")}</b>
        {remodelDifference > 0.005 && <> · <b>{money(remodelDifference, "USD")} por encima</b></>}
      </p>}
      {data.expenses.length > 0 && <div className="expense-category-filters" aria-label="Filtrar costos">
        <button className={expenseCategoryFilter === "all" ? "active" : ""} onClick={() => setExpenseCategoryFilter("all")}>Todos <span>{data.expenses.length}</span></button>
        {pendingCount > 0 && <button className={expenseCategoryFilter === "pending" ? "active" : ""} onClick={() => setExpenseCategoryFilter("pending")}>Falta pagar <span>{pendingCount}</span></button>}
        {categories.map((category) => {
          const count = data.expenses.filter((expense) => expense.categoryId === category.id).length;
          return count > 0 ? <button key={category.id} className={expenseCategoryFilter === category.id ? "active" : ""} onClick={() => setExpenseCategoryFilter(category.id)}>{category.name} <span>{count}</span></button> : null;
        })}
      </div>}
      {data.expenses.length === 0 ? <EmptyState title="Todavía no hay costos" copy="Ingresá el primer costo para comenzar." action="Ingresar costo" onAction={() => setModal("expense")} /> : filteredExpenses.length === 0 ? <div className="filtered-empty"><b>No hay costos en este filtro.</b><button className="text-button" onClick={() => setExpenseCategoryFilter("all")}>Ver todos</button></div> : (
        <><p className="list-hint">Tocá un costo para ver el detalle o registrar un pago.</p>
        <div className="expense-sheet-wrap expense-desktop-view">
          <table className="expense-sheet">
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="number-cell">Monto</th><th className="number-cell">Pagado</th><th className="number-cell">Falta pagar</th></tr></thead>
            <tbody>{filteredExpenses.map((expense) => {
              const paid = paymentForExpense(expense);
              const remaining = remainingForExpense(expense);
              const expanded = expandedExpenseId === expense.id;
              return <Fragment key={expense.id}><tr
                className={`expense-data-row ${expanded ? "expanded" : ""}`}
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => toggleExpense(expense)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleExpense(expense);
                  }
                }}
              >
                <td className="date-cell">{shortDate(expense.date)}</td>
                <td className="concept-cell"><b>{categoryName(expense.categoryId)}</b>{subcategoryName(expense.subcategoryId) && <span> · {subcategoryName(expense.subcategoryId)}</span>}{expense.description && <small>{expense.description}</small>}</td>
                <td className="number-cell"><b>{money(expense.amount, expense.currency)}</b></td>
                <td className="number-cell paid-cell">{money(paid, expense.currency)}</td>
                <td className="number-cell balance-cell">{remaining > 0.005 ? money(remaining, expense.currency) : <span className="paid">✓ Pagado</span>}</td>
              </tr>
              {expanded && <tr className="expense-payment-row"><td colSpan={5}>
                {expenseDetails(expense, remaining)}
              </td></tr>}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
        <div className="expense-mobile-list">{filteredExpenses.map((expense) => {
          const remaining = remainingForExpense(expense);
          const expanded = expandedExpenseId === expense.id;
          return <article className={`expense-mobile-card ${expanded ? "expanded" : ""}`} key={expense.id}>
            <button type="button" className="expense-mobile-summary" aria-expanded={expanded} onClick={() => toggleExpense(expense)}>
              <div className="expense-mobile-title"><b>{pathName(expense.categoryId, expense.subcategoryId)}</b><strong>{money(expense.amount, expense.currency)}</strong></div>
              <div className="expense-mobile-meta"><time>{shortDate(expense.date)}</time>{balanceLabel(expense, remaining)}</div>
            </button>
            {expanded && <div className="expense-mobile-details">{expenseDetails(expense, remaining)}</div>}
          </article>;
        })}</div></>
      )}
      <div className="expenses-footer">
        <button className="text-button" onClick={() => setView("categories")}>Administrar categorías</button>
        {data.payments.length > 0 && <button className="text-button" onClick={() => setShowPaymentHistory((visible) => !visible)}>{showPaymentHistory ? "Ocultar historial de pagos" : `Ver historial de pagos (${data.payments.length})`}</button>}
      </div>
      {showPaymentHistory && data.payments.length > 0 && <section className="history-section">
        <h2>Historial de pagos</h2>
        <div className="payment-history-list">{data.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((payment) => {
          const expense = data.expenses.find((item) => item.id === payment.expenseId);
          return <article key={payment.id}>
            <div><b>{expense ? pathName(expense.categoryId, expense.subcategoryId) : "Costo"}</b><small>{shortDate(payment.date)}{payment.description ? ` · ${payment.description}` : ""}</small></div>
            <strong>{money(payment.amount, payment.currency)}</strong>
            <button className="danger-button compact" onClick={() => deletePayment(payment)}>Eliminar</button>
          </article>;
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
      <SimpleHeading title="Presupuestos" action="Nueva comparación" onAction={() => setModal("budget")} />
      {data.budgetGroups.length === 0 ? <EmptyState title="No hay presupuestos cargados" copy="Creá una comparación (por ejemplo “sanitarios del baño”) y agregá las ofertas de cada proveedor. Al aprobar una, pasa a Costos." action="Nueva comparación" onAction={() => setModal("budget")} /> : (
        <div className="budget-groups">{data.budgetGroups.map((group) => {
          const amounts = group.offers.map((offer) => toArs(offer.amount, offer.currency, offer.rate));
          const cheapest = amounts.length ? Math.min(...amounts) : 0;
          const approved = group.offers.find((offer) => offer.id === group.approvedOfferId);
          return <section className="budget-group" key={group.id}>
            <div className="budget-group-head"><div><span className="soft-label">{pathName(group.categoryId, group.subcategoryId)}</span><h2>{group.name}</h2></div><div className="budget-head-actions">{approved && <span className="approved-pill">✓ {approved.supplier}</span>}<button className="secondary-button" onClick={() => { setSelectedBudgetId(group.id); setModal("offer"); }}>＋ Agregar oferta</button><button className="danger-button compact" onClick={() => deleteBudgetGroup(group)}>Eliminar</button></div></div>
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

  const deleteInvestor = (investor: Investor) => {
    if (!window.confirm(`¿Eliminar a “${investor.name}” y todos sus aportes? Esta acción no se puede deshacer.`)) return;
    setData((current) => ({ ...current, investors: current.investors.filter((item) => item.id !== investor.id) }));
    notify("Inversor eliminado");
  };

  const deleteContribution = (investor: Investor, contribution: InvestorContribution) => {
    if (!window.confirm(`¿Eliminar el aporte de ${money(contribution.amount, contribution.currency ?? "USD")} del ${shortDate(contribution.date)}?`)) return false;
    setData((current) => ({
      ...current,
      investors: current.investors.map((item) => item.id === investor.id ? { ...item, contributions: item.contributions.filter((entry) => entry.id !== contribution.id) } : item),
    }));
    notify("Aporte eliminado");
    return true;
  };

  const renderInvestors = () => {
    const plan = data.investmentPlan;
    const investorCapital = investorCapitalTotal;
    const investorProfit = data.investors.reduce((sum, investor) => sum + investor.profitUsd, 0);
    const calculatedOwnCapital = Math.max(0, propertyCostWithCommission(plan.propertyValueUsd, plan.propertyCommissionPercent) + plan.remodelBudgetUsd - investorCapital);
    const effectiveOwnCapital = calculatedOwnCapital;
    const ownerProfit = plan.projectedSalePriceUsd > 0 ? plan.projectedSalePriceUsd - investorCapital - investorProfit - effectiveOwnCapital : 0;
    const ownReturnPercent = effectiveOwnCapital ? (ownerProfit / effectiveOwnCapital) * 100 : 0;
    const ownTermDays = plan.purchaseDate && plan.projectedSaleDate
      ? (new Date(`${plan.projectedSaleDate}T12:00:00`).getTime() - new Date(`${plan.purchaseDate}T12:00:00`).getTime()) / 86_400_000
      : null;
    const ownAnnualRate = ownTermDays && ownTermDays > 0 ? ownReturnPercent * (365 / ownTermDays) : null;
    const ownRateStatus = !effectiveOwnCapital ? "Sin aporte" : !plan.projectedSaleDate ? "Falta fecha de venta" : !plan.purchaseDate ? "Falta fecha de compra" : !ownTermDays || ownTermDays <= 0 ? "Revisar fechas" : "Calculada";
    const propertyCommissionUsd = plan.propertyValueUsd * (plan.propertyCommissionPercent / 100);
    const propertyTotalUsd = propertyCostWithCommission(plan.propertyValueUsd, plan.propertyCommissionPercent);
    const remodelDifference = totals.committedUsd - plan.remodelBudgetUsd;
    const editPlan = (field: "property" | "remodel" | "sale") => { setInvestmentField(field); setModal("investmentPlan"); };
    return <div className="page-content">
      <SimpleHeading title="Inversores" action="Nuevo inversor" onAction={() => { setSelectedInvestorId(""); setModal("investor"); }} />

      <section className="funding-group"><span className="funding-group-label">Inversión y venta · tocá para editar</span><div className="investment-plan-grid">
        <button type="button" className="plan-card" onClick={() => editPlan("property")}><span>Valor de la propiedad</span><strong>{money(propertyTotalUsd, "USD")}</strong><small>{plan.propertyValueUsd > 0 ? `Incluye ${money(propertyCommissionUsd, "USD")} de comisiones (${percent(plan.propertyCommissionPercent)})` : "Falta cargar el valor"}</small></button>
        <button type="button" className={`plan-card ${plan.remodelBudgetUsd > 0 && remodelDifference > 0.005 ? "over" : ""}`} onClick={() => editPlan("remodel")}><span>Remodelación proyectada</span><strong>{money(plan.remodelBudgetUsd, "USD")}</strong><small>{plan.remodelBudgetUsd <= 0 ? "Falta cargar la proyección" : remodelDifference > 0.005 ? `${money(remodelDifference, "USD")} por encima` : "Dentro de lo proyectado"}</small></button>
        <button type="button" className="plan-card" onClick={() => editPlan("sale")}><span>Venta proyectada</span><strong>{money(plan.projectedSalePriceUsd, "USD")}</strong><small>{plan.projectedSaleDate ? `Fecha estimada: ${shortDate(plan.projectedSaleDate)}` : "Falta definir la fecha"}</small></button>
      </div></section>

      <section className="funding-group"><span className="funding-group-label">Capital propio</span><div className="funding-summary-grid own-funding-summary">
        <article><span>Capital propio calculado</span><strong>{money(effectiveOwnCapital, "USD")}</strong><small>{plan.ownCapitalManual ? `Estimado informado: ${money(plan.ownCapitalUsd, "USD")}` : "Calculado automáticamente"}</small></article>
        <article className={ownerProfit < 0 ? "negative" : "owner-profit"}><span>Ganancia proyectada propia</span><strong>{money(ownerProfit, "USD")}</strong><small>{plan.projectedSalePriceUsd > 0 ? "Según venta proyectada" : "Falta cargar el precio de venta"}</small></article>
      </div></section>
      <section className="funding-group"><span className="funding-group-label">Inversores</span><div className="funding-summary-grid investor-funding-summary">
        <article><span>Capital de inversores</span><strong>{money(investorCapital, "USD")}</strong></article>
        <article><span>Ganancia pactada de inversores</span><strong>{money(investorProfit, "USD")}</strong></article>
        <article><span>Total a devolver a inversores</span><strong>{money(investorCapital + investorProfit, "USD")}</strong></article>
      </div></section>

      <><div className="investor-sheet-wrap investor-desktop-view">
        <table className="investor-sheet">
          <thead><tr><th>Inversor</th><th>Fecha</th><th className="number-cell">Monto</th><th className="number-cell">Ganancia</th><th className="number-cell">A devolver en USD</th><th className="number-cell">Ganancia %</th><th className="number-cell">Tasa anual simple</th></tr></thead>
          <tbody>
            <Fragment><tr className={`investor-data-row own-capital-row ${expandedInvestorId === "own-capital" ? "expanded" : ""}`} tabIndex={0} aria-expanded={expandedInvestorId === "own-capital"} onClick={() => setExpandedInvestorId((current) => current === "own-capital" ? "" : "own-capital")} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedInvestorId((current) => current === "own-capital" ? "" : "own-capital"); }
            }}>
              <td><b>Capital propio calculado</b><small>Fila fija</small></td>
              <td>{plan.purchaseDate ? shortDate(plan.purchaseDate) : "—"}</td>
              <td className="number-cell"><b>{money(effectiveOwnCapital, "USD")}</b></td>
              <td className="number-cell profit-cell"><b>{money(ownerProfit, "USD")}</b></td>
              <td className="number-cell"><b>{money(effectiveOwnCapital + ownerProfit, "USD")}</b></td>
              <td className="number-cell">{percent(ownReturnPercent)}</td>
              <td className="number-cell annual-rate-cell">{ownAnnualRate === null ? <small className="rate-warning">{ownRateStatus}</small> : <div className="annual-rate-value"><b>{percent(ownAnnualRate)}</b><small>{Math.round(ownTermDays ?? 0)} días</small></div>}</td>
            </tr>{expandedInvestorId === "own-capital" && <tr className="investor-actions-row own-capital-actions-row"><td colSpan={7}><div><span>Se calcula con propiedad + {percent(plan.propertyCommissionPercent)} de comisiones + remodelación proyectada − aportes de inversores.</span><div className="investor-actions"><button className="mini-button" onClick={() => setModal("investmentPlan")}>Editar valores de la inversión</button></div></div></td></tr>}</Fragment>
            {data.investors.map((investor) => {
            const metrics = investorMetrics(investor, plan.projectedSaleDate);
            const expanded = expandedInvestorId === investor.id;
            const contributions = investor.contributions.slice().sort((a, b) => a.date.localeCompare(b.date));
            const toggleInvestor = () => setExpandedInvestorId((current) => current === investor.id ? "" : investor.id);
            return <Fragment key={investor.id}><tr className={`investor-data-row ${expanded ? "expanded" : ""}`} tabIndex={0} aria-expanded={expanded} onClick={toggleInvestor} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleInvestor(); }
            }}>
              <td><b>{investor.name}</b></td>
              <td><div className="investor-contribution-cell">{contributions.length === 0 ? <small>Sin fecha</small> : contributions.map((contribution) => <span key={contribution.id}>{shortDate(contribution.date)}</span>)}</div></td>
              <td className="number-cell"><div className="investor-contribution-cell amount">{contributions.length === 0 ? <small>Sin monto</small> : contributions.map((contribution) => <span key={contribution.id}><b>{money(contribution.amount, contribution.currency ?? "USD")}</b></span>)}</div></td>
              <td className="number-cell profit-cell"><b>{money(investor.profitAmount ?? investor.profitUsd, investor.profitCurrency ?? "USD")}</b>{(investor.profitCurrency ?? "USD") === "ARS" && <small>{money(investor.profitUsd, "USD")}</small>}</td>
              <td className="number-cell"><b>{money(metrics.capital + investor.profitUsd, "USD")}</b></td>
              <td className="number-cell">{percent(metrics.totalReturnPercent)}</td>
              <td className="number-cell annual-rate-cell">{metrics.annualRate === null ? <small className="rate-warning">{metrics.annualRateStatus}</small> : <div className="annual-rate-value"><b>{percent(metrics.annualRate)}</b><small>{Math.round(metrics.termDays ?? 0)} días</small></div>}</td>
            </tr>{expanded && <tr className="investor-actions-row"><td colSpan={7}><div className="investor-expanded-actions"><div className="contribution-edit-list">{contributions.map((contribution) => <button className="mini-button" type="button" key={contribution.id} onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(contribution.id); setModal("contribution"); }}>Editar aporte · {shortDate(contribution.date)} · {money(contribution.amount, contribution.currency ?? "USD")}</button>)}</div><div className="investor-actions"><button className="row-payment-button" onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(""); setModal("contribution"); }}>＋ Aporte</button><button className="mini-button" onClick={() => { setSelectedInvestorId(investor.id); setModal("investor"); }}>Editar inversor</button><button className="danger-button compact" onClick={() => deleteInvestor(investor)}>Eliminar inversor</button></div></div></td></tr>}</Fragment>;
          })}</tbody>
        </table>
        <div className="annual-rate-help">Tocá una fila para ver opciones. Tasa anual simple: ganancia % × 365 ÷ días hasta la venta (sin reinversión).</div>
      </div>
      <div className="investor-mobile-list">
        <article className={`investor-mobile-card own-capital-card ${expandedInvestorId === "own-capital" ? "expanded" : ""}`}>
          <button type="button" className="investor-mobile-summary" aria-expanded={expandedInvestorId === "own-capital"} onClick={() => setExpandedInvestorId((current) => current === "own-capital" ? "" : "own-capital")}>
            <div><b>Capital propio calculado</b><small>Fila fija</small></div>
            <span>Monto <b>{money(effectiveOwnCapital, "USD")}</b></span>
            <span>Tasa anual <b>{ownAnnualRate === null ? ownRateStatus : percent(ownAnnualRate)}</b></span>
          </button>
          {expandedInvestorId === "own-capital" && <div className="investor-mobile-details">
            <div className="investor-mobile-stats"><span>Fecha <b>{plan.purchaseDate ? shortDate(plan.purchaseDate) : "—"}</b></span><span>Ganancia <b>{money(ownerProfit, "USD")}</b></span><span>A devolver <b>{money(effectiveOwnCapital + ownerProfit, "USD")}</b></span><span>Ganancia % <b>{percent(ownReturnPercent)}</b></span></div>
            <div className="investor-mobile-actions"><button className="mini-button" onClick={() => setModal("investmentPlan")}>Editar valores de la inversión</button></div>
          </div>}
        </article>
        {data.investors.map((investor) => {
        const metrics = investorMetrics(investor, plan.projectedSaleDate);
        const expanded = expandedInvestorId === investor.id;
        const contributions = investor.contributions.slice().sort((a, b) => a.date.localeCompare(b.date));
        return <article className={`investor-mobile-card ${expanded ? "expanded" : ""}`} key={investor.id}>
          <button type="button" className="investor-mobile-summary" aria-expanded={expanded} onClick={() => setExpandedInvestorId((current) => current === investor.id ? "" : investor.id)}>
            <div><b>{investor.name}</b><small>{investor.contributions.length} {investor.contributions.length === 1 ? "aporte" : "aportes"}</small></div>
            <span>Monto <b>{money(metrics.capital, "USD")}</b></span>
            <span>Tasa anual <b>{metrics.annualRate === null ? metrics.annualRateStatus : percent(metrics.annualRate)}</b></span>
          </button>
          {expanded && <div className="investor-mobile-details">
            <div className="investor-mobile-stats"><span>Ganancia <b>{money(investor.profitAmount ?? investor.profitUsd, investor.profitCurrency ?? "USD")}</b></span><span>A devolver <b>{money(metrics.capital + investor.profitUsd, "USD")}</b></span><span>Ganancia % <b>{percent(metrics.totalReturnPercent)}</b></span><span>Plazo <b>{metrics.termDays ? `${Math.round(metrics.termDays)} días` : "—"}</b></span></div>
            <div className="investor-mobile-contributions"><span>Aportes recibidos</span>{contributions.length === 0 ? <small>Sin aportes</small> : <><div className="contribution-mobile-head"><span>Fecha</span><span>Monto</span></div>{contributions.map((contribution) => <div className="contribution-mobile-data" key={contribution.id}><span>{shortDate(contribution.date)}</span><b>{money(contribution.amount, contribution.currency ?? "USD")}</b></div>)}</>}</div>
            {contributions.length > 0 && <div className="contribution-edit-list">{contributions.map((contribution) => <button className="mini-button" type="button" key={contribution.id} onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(contribution.id); setModal("contribution"); }}>Editar aporte · {shortDate(contribution.date)}</button>)}</div>}
            <div className="investor-mobile-actions"><button className="row-payment-button" onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(""); setModal("contribution"); }}>＋ Aporte</button><button className="mini-button" onClick={() => { setSelectedInvestorId(investor.id); setModal("investor"); }}>Editar</button><button className="danger-button compact" onClick={() => deleteInvestor(investor)}>Eliminar</button></div>
          </div>}
        </article>;
      })}<div className="mobile-rate-note">Tasa anual simple: no incluye reinversión.</div></div></>
    </div>;
  };

  const renderCategories = () => (
    <div className="page-content">
      <button className="text-button back-link" onClick={() => setView("expenses")}>← Volver a Costos</button>
      <SimpleHeading title="Categorías" />
      <section className="manage-card category-catalog">
        <div className="manage-head"><h2>Categorías de costos</h2><button className="secondary-button" onClick={() => addNamedItem("category")}>＋ Agregar categoría</button></div>
        {categories.map((category) => {
          const linked = subcategoriesFor(category.id);
          return <div className="category-catalog-row" key={category.id}>
            <div className="category-catalog-main">
              <b>{category.name}</b>
              <div className="subcategory-chips">
                {linked.length ? linked.map((subcategory) => <span className="subcategory-chip" key={subcategory.id}>{subcategory.name}{!defaultSubcategoryIds.has(subcategory.id) && <button title="Eliminar subcategoría" onClick={() => deleteCreatedItem("subcategories", subcategory)}>×</button>}</span>) : <span>Sin subcategorías</span>}
              </div>
            </div>
            <div className="catalog-actions"><button onClick={() => addSubcategoryForCategory(category.id)}>＋ Subcategoría</button><button onClick={() => renameItem("categories", category)}>Renombrar</button>{!defaultCategoryIds.has(category.id) && <button className="danger" onClick={() => deleteCreatedItem("categories", category)}>Eliminar</button>}</div>
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
    notify("Presupuesto aprobado y agregado a Costos");
  };

  const deleteBudgetGroup = (group: BudgetGroup) => {
    const approved = group.offers.find((offer) => offer.id === group.approvedOfferId);
    const note = approved ? " El costo aprobado ya registrado se conservará." : "";
    if (!window.confirm(`¿Eliminar el presupuesto “${group.name}” y todas sus ofertas?${note}`)) return;
    setData((current) => ({ ...current, budgetGroups: current.budgetGroups.filter((item) => item.id !== group.id) }));
    notify("Presupuesto eliminado");
  };

  const renameItem = (collection: "categories" | "subcategories", item: Category) => {
    const name = window.prompt("Nuevo nombre", item.name)?.trim();
    if (!name) return;
    setData((current) => ({ ...current, [collection]: current[collection].map((entry) => entry.id === item.id ? { ...entry, name } : entry) }));
  };
  const deleteCreatedItem = (collection: "categories" | "subcategories", item: Category) => {
    const isCategory = collection === "categories";
    const hasReferences = isCategory
      ? data.expenses.some((entry) => entry.categoryId === item.id) || data.progress.some((entry) => entry.categoryId === item.id) || data.budgetGroups.some((entry) => entry.categoryId === item.id)
      : data.expenses.some((entry) => entry.subcategoryId === item.id) || data.progress.some((entry) => entry.subcategoryId === item.id) || data.budgetGroups.some((entry) => entry.subcategoryId === item.id);
    if (hasReferences) {
      window.alert(`No se puede eliminar “${item.name}” porque ya está usado en movimientos, presupuestos o avances.`);
      return;
    }
    if (!window.confirm(`¿Eliminar “${item.name}”? Esta acción no se puede deshacer.`)) return;
    setData((current) => ({
      ...current,
      [collection]: current[collection].filter((entry) => entry.id !== item.id),
      categories: isCategory ? current.categories.filter((entry) => entry.id !== item.id) : current.categories.map((entry) => ({ ...entry, subcategoryIds: entry.subcategoryIds?.filter((id) => id !== item.id) })),
    }));
    notify(`${isCategory ? "Categoría" : "Subcategoría"} eliminada`);
  };

  if (!loaded) return <div className="app-loading"><h1>Control de Obra</h1><p>Preparando tus datos…</p></div>;

  const activeNav = view === "categories" ? "expenses" : view;
  const saveLabel = saveStatus === "saved" ? "Todo guardado" : saveStatus === "saving" ? "Guardando…" : "Sin conexión, se reintentará";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><b>Control de Obra</b></div>
        <nav>{nav.map((item) => <button key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => setView(item.id)}><NavIcon name={item.icon} />{item.label}</button>)}</nav>
        <div className="sidebar-foot"><div className={`sync-dot ${saveStatus}`} /><span>{saveLabel}</span></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><b>Control de Obra</b><div className={`sync-dot ${saveStatus}`} title={saveLabel} /></div>
          <button className="rate-chip" onClick={() => setModal("rate")} title={`Cotización del ${shortDate(rateDate)} · tocá para editar`}><span>Dólar oficial</span><b>{money(rate, "ARS")}</b></button>
        </header>
        {view === "home" && renderHome()}
        {view === "expenses" && renderExpenses()}
        {view === "budgets" && renderBudgets()}
        {view === "investors" && renderInvestors()}
        {view === "categories" && renderCategories()}
      </section>

      <nav className="bottom-nav">{nav.map((item) => <button key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => setView(item.id)}><NavIcon name={item.icon} /><small>{item.label}</small></button>)}</nav>

      {modal === "expense" && <ExpenseModal data={data} rate={rate} expense={data.expenses.find((item) => item.id === selectedExpenseId)} addNamedItem={addNamedItem} addSubcategoryForCategory={addSubcategoryForCategory} close={() => { setModal(null); setSelectedExpenseId(""); }} save={(expense) => {
        setData((current) => ({ ...current, expenses: current.expenses.some((item) => item.id === expense.id) ? current.expenses.map((item) => item.id === expense.id ? expense : item) : [...current.expenses, expense] }));
        setModal(null); setSelectedExpenseId(""); notify("Costo guardado");
      }} />}
      {modal === "payment" && <PaymentModal data={data} rate={rate} initialExpenseId={selectedExpenseId} remainingForExpense={remainingForExpense} pathName={pathName} close={() => { setModal(null); setSelectedExpenseId(""); }} save={(payment) => { setData((current) => ({ ...current, payments: [...current.payments, payment] })); setModal(null); setSelectedExpenseId(""); notify("Pago registrado"); }} />}
      {modal === "budget" && <BudgetModal categories={categories} subcategories={subcategories} addNamedItem={addNamedItem} addSubcategoryForCategory={addSubcategoryForCategory} close={() => setModal(null)} save={(group) => { setData((current) => ({ ...current, budgetGroups: [...current.budgetGroups, group] })); setSelectedBudgetId(group.id); setModal("offer"); notify("Comparación creada"); }} />}
      {modal === "offer" && <OfferModal rate={rate} group={data.budgetGroups.find((item) => item.id === selectedBudgetId)} close={() => { setModal(null); setSelectedBudgetId(""); }} save={(offer) => { setData((current) => ({ ...current, budgetGroups: current.budgetGroups.map((group) => group.id === selectedBudgetId ? { ...group, offers: [...group.offers, offer] } : group) })); setModal(null); setSelectedBudgetId(""); notify("Oferta agregada"); }} />}
      {modal === "rate" && <RateModal rate={rate} date={rateDate} source={rateSource} history={data.exchangeRateHistory ?? []} close={() => setModal(null)} save={(nextRate, nextDate) => { const nextSource = "Cotización ajustada manualmente"; setRate(nextRate); setRateDate(nextDate); setRateSource(nextSource); setData((current) => ({ ...current, exchangeRateHistory: updateRateHistory(current.exchangeRateHistory ?? [], { date: nextDate, rate: nextRate, source: nextSource }) })); setModal(null); notify("Cotización actualizada"); }} />}
      {modal === "investmentPlan" && <InvestmentPlanModal field={investmentField} plan={data.investmentPlan} investorCapitalUsd={investorCapitalTotal} close={() => setModal(null)} save={(investmentPlan) => { setData((current) => ({ ...current, investmentPlan })); setModal(null); notify("Datos de inversión guardados"); }} />}
      {modal === "investor" && <InvestorModal rate={rate} investor={selectedInvestor} close={() => { setModal(null); setSelectedInvestorId(""); }} save={(investor) => {
        setData((current) => ({ ...current, investors: current.investors.some((item) => item.id === investor.id) ? current.investors.map((item) => item.id === investor.id ? investor : item) : [...current.investors, investor] }));
        setModal(null); setSelectedInvestorId(""); notify("Inversor guardado");
      }} />}
      {modal === "contribution" && <ContributionModal rate={rate} investor={selectedInvestor} contribution={selectedContribution} remove={selectedInvestor && selectedContribution ? () => { if (deleteContribution(selectedInvestor, selectedContribution)) { setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); } } : undefined} close={() => { setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); }} save={(contribution) => {
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

function SimpleHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <header className="simple-heading"><h1>{title}</h1>{action && <button className="primary-button large" onClick={onAction}>＋ {action}</button>}</header>;
}

function EmptyState({ icon, title, copy, action, onAction }: { icon?: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state">{icon && <span>{icon}</span>}<h2>{title}</h2><p>{copy}</p>{action && <button className="primary-button" onClick={onAction}>＋ {action}</button>}</div>;
}

function KindBadge({ kind }: { kind: ExpenseKind }) {
  return <span className={`kind-badge ${kind}`}>{kind === "approved" ? "Presupuesto aprobado" : kind === "additional" ? "Costo adicional" : "Costo"}</span>;
}

function CategorySelect({ label, value, setValue, items, onNew, className }: { label: string; value: string; setValue: (value: string) => void; items: Category[]; onNew: () => string; className?: string }) {
  return <label className={className}><span>{label}</span><select required value={value} onChange={(event) => { if (event.target.value === "__new") { const id = onNew(); if (id) setValue(id); } else setValue(event.target.value); }}><option value="">Elegir…</option>{items.filter((item) => !item.archived).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}<option value="__new">＋ Crear nueva</option></select></label>;
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

function AmountField({ label, currency, setCurrency, amount, setAmount, invalid = false, className = "span-2" }: { label: string; currency: Currency; setCurrency: (value: Currency) => void; amount: string; setAmount: (value: string) => void; invalid?: boolean; className?: string }) {
  return <div className={`amount-field ${className}`}><span>{label}</span><div className="amount-control"><CurrencyFields currency={currency} setCurrency={setCurrency} /><label className="amount-input"><span>{currency === "USD" ? "US$" : "$"}</span><FormattedAmountInput ariaLabel={`${label} en ${currency}`} required invalid={invalid} value={amount} setValue={setAmount} placeholder="0" /></label></div></div>;
}

function ConversionHint({ amount, currency, rate }: { amount: string; currency: Currency; rate: number }) {
  if (!amount || Number(amount) <= 0) return null;
  return <p className="conversion-hint span-2">≈ {currency === "ARS" ? money(Number(amount) / rate, "USD") : money(Number(amount) * rate, "ARS")} (dólar {money(rate, "ARS")})</p>;
}

function MoreOptions({ open, setOpen, summary, children }: { open: boolean; setOpen: (value: boolean) => void; summary: string; children: ReactNode }) {
  if (open) return <>{children}</>;
  return <button type="button" className="more-options span-2" onClick={() => setOpen(true)}><span>＋ Más opciones</span><small>{summary}</small></button>;
}

function ExpenseModal({ data, rate, expense, addNamedItem, addSubcategoryForCategory, close, save }: { data: AppState; rate: number; expense?: Expense; addNamedItem: (kind: "category" | "subcategory") => string; addSubcategoryForCategory: (categoryId: string) => string; close: () => void; save: (expense: Expense) => void }) {
  const lastCurrency = data.expenses[data.expenses.length - 1]?.currency ?? "ARS";
  const [date, setDate] = useState(expense?.date ?? today());
  const [description, setDescription] = useState(expense?.description ?? "");
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(expense?.subcategoryId ?? "");
  const [responsible, setResponsible] = useState(expense?.responsible ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState<Currency>(expense?.currency ?? lastCurrency);
  const [showMore, setShowMore] = useState(Boolean(expense));
  const selectedRate = expense?.rate ?? rate;
  const hasSubcategories = categoryId ? linkedSubcategories(categoryId, data.categories, data.subcategories).length > 0 : false;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (Number(amount) <= 0) return;
    save({ id: expense?.id ?? uid("exp"), date, description: description.trim(), categoryId, subcategoryId, responsible: responsible.trim(), amount: Number(amount), currency, rate: selectedRate, kind: expense?.kind ?? "manual", budgetGroupId: expense?.budgetGroupId });
  };
  return <Modal title={expense ? "Editar costo" : "Ingresar costo"} close={close}><form className="form-grid" onSubmit={submit}>
    <AmountField label="Monto" currency={currency} setCurrency={setCurrency} amount={amount} setAmount={setAmount} />
    <ConversionHint amount={amount} currency={currency} rate={selectedRate} />
    <CategorySelect className={hasSubcategories ? undefined : "span-2"} label="Categoría" value={categoryId} setValue={(value) => { setCategoryId(value); setSubcategoryId(""); }} items={data.categories} onNew={() => addNamedItem("category")} />
    {hasSubcategories && <SubcategorySelect categoryId={categoryId} value={subcategoryId} setValue={setSubcategoryId} categories={data.categories} subcategories={data.subcategories} onNew={() => addSubcategoryForCategory(categoryId)} />}
    <label className="span-2"><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: compra de grifería" /></label>
    <MoreOptions open={showMore} setOpen={setShowMore} summary={`Fecha: ${date === today() ? "hoy" : shortDate(date)} · Responsable`}>
      <label><span>Fecha</span><DateInput required value={date} setValue={setDate} /></label>
      <label><span>Responsable (opcional)</span><input value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Arquitecto, albañil…" /></label>
    </MoreOptions>
    <FormActions close={close} label={expense ? "Guardar cambios" : "Guardar costo"} />
  </form></Modal>;
}

function InlinePaymentForm({ expense, rate, remaining, payments, removePayment, edit, remove, save }: { expense: Expense; rate: number; remaining: number; payments: Payment[]; removePayment: (payment: Payment) => void; edit?: () => void; remove?: () => void; save: (payment: Payment) => void }) {
  const [partial, setPartial] = useState(false);
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
  const tooMuch = Number(amount) > maxAmount + 0.005;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!amount || Number(amount) <= 0 || tooMuch) return;
    save({ id: uid("pay"), expenseId: expense.id, date, description: description.trim(), amount: Number(amount), currency, rate });
    setPartial(false);
    setAmount("");
    setDescription("");
  };
  const payFull = () => save({ id: uid("pay"), expenseId: expense.id, date: today(), description: "", amount: remaining, currency: expense.currency, rate });
  const details = [
    expense.description && ["Descripción", expense.description],
    expense.responsible && ["Responsable", expense.responsible],
    ["Equivale a", expense.currency === "ARS" ? money(expense.amount / expense.rate, "USD") : money(expense.amount * expense.rate, "ARS")],
  ].filter(Boolean) as string[][];

  return <div className="inline-payment-panel">
    {edit && remove && <div className="expense-detail-head">
      <dl className="expense-detail-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="expense-detail-actions"><button type="button" className="mini-button" onClick={edit}>Editar</button><button type="button" className="danger-button compact" onClick={remove}>Eliminar</button></div>
    </div>}
    {payments.length > 0 && <div className="expense-payments">
      <span>Pagos de este costo</span>
      {payments.slice().sort((a, b) => a.date.localeCompare(b.date)).map((payment) => <div key={payment.id}>
        <small>{shortDate(payment.date)}{payment.description ? ` · ${payment.description}` : ""}</small>
        <b>{money(payment.amount, payment.currency)}</b>
        <button type="button" className="link-danger" onClick={() => removePayment(payment)}>Eliminar</button>
      </div>)}
    </div>}
    {remaining <= 0.005 ? <div className="inline-payment-complete">✓ Este costo ya está pagado.</div> : !partial ? <div className="full-payment-choice">
      <div><span>Falta pagar</span><b>{money(remaining, expense.currency)}</b></div>
      <button type="button" className="secondary-button" onClick={() => setPartial(true)}>Pagar una parte</button>
      <button type="button" className="primary-button" onClick={payFull}>Pagar todo</button>
    </div> : <form className="form-grid inline-payment-form" onSubmit={submit}>
      <AmountField label="Monto pagado" currency={currency} setCurrency={(value) => { setCurrency(value); setAmount(""); }} amount={amount} setAmount={setAmount} invalid={tooMuch} />
      {amount && Number(amount) > 0 && <p className={`conversion-hint span-2 ${tooMuch ? "error" : ""}`}>{tooMuch ? <>Supera lo que falta pagar. Máximo: <b>{money(maxAmount, currency)}</b></> : <>Se descuentan {money(debitAmount, expense.currency)} del saldo.</>}</p>}
      <label><span>Fecha del pago</span><DateInput required value={date} setValue={setDate} /></label>
      <label><span>Nota (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: transferencia" /></label>
      <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setPartial(false)}>Cancelar</button><button className="primary-button" type="submit">Guardar pago</button></div>
    </form>}
  </div>;
}

function PaymentModal({ data, rate, initialExpenseId, remainingForExpense, pathName, close, save }: { data: AppState; rate: number; initialExpenseId: string; remainingForExpense: (expense: Expense) => number; pathName: (categoryId: string, subcategoryId: string) => string; close: () => void; save: (payment: Payment) => void }) {
  const [expenseId, setExpenseId] = useState(initialExpenseId);
  const expense = data.expenses.find((item) => item.id === expenseId);
  return <Modal title="Registrar pago" close={close}><div className="form-grid">
    <label className="span-2"><span>¿Qué costo pagaste?</span><select required value={expenseId} onChange={(event) => setExpenseId(event.target.value)}><option value="">Elegir costo…</option>{data.expenses.filter((item) => remainingForExpense(item) > 0.005).map((item) => <option value={item.id} key={item.id}>{item.description || pathName(item.categoryId, item.subcategoryId)} · falta {money(remainingForExpense(item), item.currency)}</option>)}</select></label>
    {expense && <div className="span-2"><InlinePaymentForm key={expense.id} expense={expense} rate={rate} remaining={remainingForExpense(expense)} payments={[]} removePayment={() => undefined} save={save} /></div>}
  </div></Modal>;
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
  const [showMore, setShowMore] = useState(false);
  if (!group) return null;
  return <Modal title={`Agregar oferta · ${group.name}`} close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (Number(amount) <= 0) return; save({ id: uid("offer"), supplier: supplier.trim(), date, description: description.trim(), amount: Number(amount), currency, rate }); }}>
    <label className="span-2"><span>Proveedor o empresa</span><input required value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Nombre del proveedor" /></label>
    <AmountField label="Monto total" currency={currency} setCurrency={setCurrency} amount={amount} setAmount={setAmount} />
    <ConversionHint amount={amount} currency={currency} rate={rate} />
    <MoreOptions open={showMore} setOpen={setShowMore} summary={`Fecha: ${date === today() ? "hoy" : shortDate(date)} · Descripción`}>
      <label><span>Fecha</span><DateInput required value={date} setValue={setDate} /></label>
      <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle breve" /></label>
    </MoreOptions>
    <FormActions close={close} label="Guardar oferta" />
  </form></Modal>;
}

function InvestmentPlanModal({ field, plan, investorCapitalUsd, close, save }: { field: "property" | "remodel" | "sale"; plan: InvestmentPlan; investorCapitalUsd: number; close: () => void; save: (plan: InvestmentPlan) => void }) {
  const [propertyValue, setPropertyValue] = useState(plan.propertyValueUsd ? plan.propertyValueUsd.toString() : "");
  const [propertyCommissionPercent, setPropertyCommissionPercent] = useState(plan.propertyCommissionPercent.toString());
  const [ownCapital, setOwnCapital] = useState(plan.ownCapitalUsd ? plan.ownCapitalUsd.toString() : "");
  const [ownCapitalManual, setOwnCapitalManual] = useState(plan.ownCapitalManual);
  const [remodelBudget, setRemodelBudget] = useState(plan.remodelBudgetUsd ? plan.remodelBudgetUsd.toString() : "");
  const [salePrice, setSalePrice] = useState(plan.projectedSalePriceUsd ? plan.projectedSalePriceUsd.toString() : "");
  const [purchaseDate, setPurchaseDate] = useState(plan.purchaseDate);
  const [saleDate, setSaleDate] = useState(plan.projectedSaleDate);
  const commissionPercent = Math.max(0, Number(propertyCommissionPercent) || 0);
  const propertyCommission = (Number(propertyValue) || 0) * (commissionPercent / 100);
  const propertyTotal = propertyCostWithCommission(Number(propertyValue) || 0, commissionPercent);
  const calculatedOwnCapital = Math.max(0, propertyTotal + (Number(remodelBudget) || 0) - investorCapitalUsd);
  const titles = { property: "Valor de la propiedad", remodel: "Remodelación proyectada", sale: "Venta proyectada" };
  return <Modal title={titles[field]} close={close} wide><form className="form-grid" onSubmit={(event) => {
    event.preventDefault();
    save({ propertyValueUsd: Number(propertyValue) || 0, propertyCommissionPercent: commissionPercent, ownCapitalUsd: ownCapitalManual ? Number(ownCapital) || 0 : calculatedOwnCapital, ownCapitalManual, remodelBudgetUsd: Number(remodelBudget) || 0, projectedSalePriceUsd: Number(salePrice) || 0, purchaseDate, projectedSaleDate: saleDate });
  }}>
    {field === "property" && <><label><span>Valor de la propiedad (USD, sin comisiones)</span><FormattedAmountInput value={propertyValue} setValue={setPropertyValue} placeholder="USD" /></label><label><span>Comisiones (%)</span><input type="number" min="0" step="0.1" value={propertyCommissionPercent} onChange={(event) => setPropertyCommissionPercent(event.target.value)} /></label><label><span>Fecha de compra de la propiedad</span><DateInput value={purchaseDate} setValue={setPurchaseDate} /></label><div className="property-total-preview span-2"><span>Costo total de la propiedad</span><strong>{money(propertyTotal, "USD")}</strong><small>{money(Number(propertyValue) || 0, "USD")} valor + {money(propertyCommission, "USD")} comisiones ({percent(commissionPercent)}).</small></div></>}
    <div className="calculated-own-capital span-2"><span>Capital propio calculado</span><strong>{money(calculatedOwnCapital, "USD")}</strong><small>Propiedad con {percent(commissionPercent)} de comisiones + remodelación proyectada − {money(investorCapitalUsd, "USD")} recibidos de inversores.</small></div>
    <label className="manual-own-toggle span-2"><input type="checkbox" checked={ownCapitalManual} onChange={(event) => { setOwnCapitalManual(event.target.checked); if (event.target.checked && !ownCapital) setOwnCapital(calculatedOwnCapital.toString()); }} /><span>Guardar un estimado de capital propio solo como referencia</span></label>
    {ownCapitalManual && <label className="span-2"><span>Estimado de capital propio (USD)</span><FormattedAmountInput value={ownCapital} setValue={setOwnCapital} placeholder="USD" /></label>}
    {ownCapitalManual && <div className="source-note span-2"><span>Solo referencia</span><b>Los cálculos de ganancia y rendimiento seguirán usando el capital propio calculado automáticamente.</b></div>}
    {field === "remodel" && <label className="span-2"><span>Presupuesto proyectado de remodelación (USD)</span><FormattedAmountInput value={remodelBudget} setValue={setRemodelBudget} placeholder="USD" /></label>}
    {field === "sale" && <><label><span>Precio proyectado de venta (USD)</span><FormattedAmountInput value={salePrice} setValue={setSalePrice} placeholder="USD" /></label><label><span>Fecha proyectada de venta</span><DateInput value={saleDate} setValue={setSaleDate} /></label></>}
    <FormActions close={close} label="Guardar valores" />
  </form></Modal>;
}

function InvestorModal({ investor, rate, close, save }: { investor?: Investor; rate: number; close: () => void; save: (investor: Investor) => void }) {
  const savedProfit = investor?.profitAmount ?? investor?.profitUsd ?? 0;
  const [name, setName] = useState(investor?.name ?? "");
  const [profit, setProfit] = useState(savedProfit ? savedProfit.toString() : "");
  const [profitCurrency, setProfitCurrency] = useState<Currency>(investor?.profitCurrency ?? "USD");
  const [firstDate, setFirstDate] = useState(today());
  const [firstAmount, setFirstAmount] = useState("");
  const [firstCurrency, setFirstCurrency] = useState<Currency>("USD");
  const profitConversionRate = investor?.profitCurrency === profitCurrency ? investor.profitRate ?? rate : rate;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || Number(profit) < 0 || (!investor && Number(firstAmount) <= 0)) return;
    const profitRate = profitConversionRate;
    save({
      id: investor?.id ?? uid("investor"),
      name: name.trim(),
      profitUsd: toUsd(Number(profit) || 0, profitCurrency, profitRate),
      profitAmount: Number(profit) || 0,
      profitCurrency,
      profitRate,
      contributions: investor?.contributions ?? [{ id: uid("contribution"), date: firstDate, amount: Number(firstAmount), currency: firstCurrency, rate }],
    });
  };
  return <Modal title={investor ? "Editar inversor" : "Nuevo inversor"} close={close}><form className="form-grid" onSubmit={submit}>
    <label className="span-2"><span>Nombre del inversor</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" /></label>
    {!investor && <><AmountField label="Primer aporte" currency={firstCurrency} setCurrency={setFirstCurrency} amount={firstAmount} setAmount={setFirstAmount} /><label className="span-2"><span>Fecha del primer aporte</span><DateInput required value={firstDate} setValue={setFirstDate} /></label></>}
    <AmountField label="Ganancia acordada" currency={profitCurrency} setCurrency={setProfitCurrency} amount={profit} setAmount={setProfit} />
    <p className="conversion-hint span-2">Se le devuelve lo que aportó más esta ganancia.{profitCurrency === "ARS" && profit ? ` Equivale a ${money(Number(profit) / profitConversionRate, "USD")}.` : ""}</p>
    <FormActions close={close} label={investor ? "Guardar cambios" : "Guardar inversor"} />
  </form></Modal>;
}

function ContributionModal({ investor, contribution, rate, remove, close, save }: { investor?: Investor; contribution?: InvestorContribution; rate: number; remove?: () => void; close: () => void; save: (contribution: InvestorContribution) => void }) {
  const [date, setDate] = useState(contribution?.date ?? today());
  const [amount, setAmount] = useState(contribution?.amount ? contribution.amount.toString() : "");
  const [currency, setCurrency] = useState<Currency>(contribution?.currency ?? "USD");
  if (!investor) return null;
  return <Modal title={`${contribution ? "Editar" : "Agregar"} aporte · ${investor.name}`} close={close}><form className="form-grid" onSubmit={(event) => {
    event.preventDefault();
    if (Number(amount) <= 0) return;
    save({ id: contribution?.id ?? uid("contribution"), date, amount: Number(amount), currency, rate: contribution?.currency === currency ? contribution.rate ?? rate : rate });
  }}>
    <AmountField label="Monto recibido" currency={currency} setCurrency={setCurrency} amount={amount} setAmount={setAmount} />
    {currency === "ARS" && <ConversionHint amount={amount} currency={currency} rate={contribution?.currency === currency ? contribution.rate ?? rate : rate} />}
    <label className="span-2"><span>Fecha en que entregó el dinero</span><DateInput required value={date} setValue={setDate} /></label>
    <FormActions close={close} label="Guardar aporte" deleteLabel={contribution ? "Eliminar aporte" : undefined} onDelete={remove} />
  </form></Modal>;
}

function RateModal({ rate, date, source, history, close, save }: { rate: number; date: string; source: string; history: ExchangeRateRecord[]; close: () => void; save: (rate: number, date: string) => void }) {
  const [nextRate, setNextRate] = useState(rate.toString()); const [nextDate, setNextDate] = useState(date);
  const [showAllHistory, setShowAllHistory] = useState(false);
  return <Modal title="Cotización del dólar" close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (Number(nextRate) < 1) return; save(Number(nextRate), nextDate); }}>
    <p className="conversion-hint span-2">Fuente: {source}. Se usa el promedio diario entre compra y venta.</p>
    <label><span>Pesos por dólar</span><FormattedAmountInput required value={nextRate} setValue={setNextRate} /></label>
    <label><span>Fecha de cotización</span><DateInput required value={nextDate} setValue={setNextDate} /></label>
    {history.length > 0 && <div className="rate-history span-2"><span>Historial de cotizaciones · {history.length} períodos</span>{history.slice(0, showAllHistory ? undefined : 8).map((item) => <div key={item.date}><time>{shortDate(item.date)}</time><b>{money(item.rate, "ARS")}</b></div>)}{history.length > 8 && <button className="text-button" type="button" onClick={() => setShowAllHistory((visible) => !visible)}>{showAllHistory ? "Ver menos" : "Ver todo el año"}</button>}</div>}
    <FormActions close={close} label="Usar esta cotización" />
  </form></Modal>;
}

function FormActions({ close, label, deleteLabel, onDelete }: { close: () => void; label: string; deleteLabel?: string; onDelete?: () => void }) {
  return <div className="form-actions span-2">{deleteLabel && onDelete && <button type="button" className="danger-button" onClick={onDelete}>{deleteLabel}</button>}<button type="button" className="secondary-button" onClick={close}>Cancelar</button><button type="submit" className="primary-button">{label}</button></div>;
}
