"use client";

import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ActionPreview, AssistantAction, AssistantChat } from "./AssistantChat";

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
// Partida del presupuesto general de la obra (lo que se piensa gastar por rubro y tipo).
type BudgetItem = {
  id: string;
  categoryId: string;
  subcategoryId: string;
  description: string;
  amount: number;
  currency: Currency;
  rate: number;
  comparisonId?: string;
};
// Algo que se puede pagar (hoy, una línea del presupuesto).
type Payable = { id: string; amount: number; currency: Currency; description: string; responsible?: string };
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
type PlanField = "property" | "remodel" | "sale" | "own";
type ExchangeRateRecord = { date: string; rate: number; source: string };
type AppState = {
  catalogVersion?: number;
  categories: Category[];
  subcategories: Subcategory[];
  expenses: Expense[];
  payments: Payment[];
  progress: ProgressItem[];
  budgetGroups: BudgetGroup[];
  budgetItems?: BudgetItem[];
  investors: Investor[];
  investmentPlan: InvestmentPlan;
  exchangeRateHistory?: ExchangeRateRecord[];
};
type View = "home" | "payments" | "progress" | "budgets" | "categories" | "investors";
type ModalName = "expense" | "payment" | "progress" | "budget" | "budgetItem" | "offer" | "rate" | "investor" | "contribution" | "investmentPlan" | null;

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
  { id: "cat-ventanas", name: "Aberturas", archived: false, subcategoryIds: [] },
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
  budgetItems: [],
  investors: [],
  investmentPlan: emptyInvestmentPlan,
  exchangeRateHistory: [],
};

function normalizeState(candidate: AppState | undefined): AppState {
  if (!candidate?.categories || !candidate?.subcategories) return initialState;
  const savedPlan = candidate.investmentPlan;
  const investmentState = {
    budgetItems: [
      ...(Array.isArray(candidate.budgetItems) ? candidate.budgetItems : []),
      // Los costos de la versión anterior pasan al presupuesto con el mismo id, así conservan sus pagos.
      ...(Array.isArray(candidate.expenses) ? candidate.expenses : []).map((expense): BudgetItem => ({
        id: expense.id,
        categoryId: expense.categoryId,
        subcategoryId: expense.subcategoryId,
        description: [expense.description, expense.responsible].filter(Boolean).join(" · "),
        amount: expense.amount,
        currency: expense.currency,
        rate: expense.rate,
        comparisonId: expense.budgetGroupId,
      })),
    ],
    expenses: [],
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
  // "Ventanas" pasó a llamarse "Aberturas" (solo si no se le había puesto otro nombre a mano).
  const renamedCategories = candidate.categories.map((item) => item.id === "cat-ventanas" && item.name === "Ventanas" ? { ...item, name: "Aberturas" } : item);
  if ((candidate.catalogVersion ?? 0) >= 2) return { ...candidate, categories: renamedCategories, ...investmentState };

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

// Fecha local (no UTC), así a la noche en Argentina no salta al día siguiente.
const localDate = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const today = () => localDate(new Date());
const yesterday = () => { const date = new Date(); date.setDate(date.getDate() - 1); return localDate(date); };
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
const usdPlain = (value: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
// Fecha corta: "23/10" (o "23/10/25" si no es de este año).
const dayMonth = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${Number(day)}/${Number(month)}${year === String(new Date().getFullYear()) ? "" : `/${year.slice(2)}`}`;
};
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

type IconName = "home" | "expenses" | "budgets" | "investors" | "plus" | "check";
const iconPaths: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  expenses: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  budgets: <><path d="M9 4h6v3H9z" /><path d="M7 5H5v16h14V5h-2" /><path d="M8.5 12h7M8.5 16h4.5" /></>,
  investors: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.5c2.4.2 4.2 1.9 5 5" /></>,
};

// Cuadro tipo "mapa de calor" de acciones: rectángulos con área proporcional a cada valor (algoritmo squarified).
type TreeRect = { x: number; y: number; w: number; h: number };
const treemapBox: TreeRect = { x: 0, y: 0, w: 150, h: 100 };
const treemapBoxNarrow: TreeRect = { x: 0, y: 0, w: 100, h: 130 };
const narrowQuery = "(max-width: 620px)";
const subscribeNarrow = (callback: () => void) => {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
function squarify(values: number[], box: TreeRect): TreeRect[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => ({ ...box, w: 0, h: 0 }));
  const areas = values.map((value) => (value / total) * box.w * box.h);
  const rects: TreeRect[] = [];
  let rest = { ...box };
  let index = 0;
  while (index < areas.length) {
    const side = Math.min(rest.w, rest.h);
    const worst = (row: number[]) => {
      const sum = row.reduce((acc, value) => acc + value, 0);
      return Math.max((side * side * Math.max(...row)) / (sum * sum), (sum * sum) / (side * side * Math.min(...row)));
    };
    const row = [areas[index]];
    let next = index + 1;
    while (next < areas.length && worst([...row, areas[next]]) <= worst(row)) row.push(areas[next++]);
    const rowSum = row.reduce((acc, value) => acc + value, 0);
    if (rest.w >= rest.h) {
      const width = rowSum / rest.h;
      let y = rest.y;
      row.forEach((area) => { rects.push({ x: rest.x, y, w: width, h: area / width }); y += area / width; });
      rest = { x: rest.x + width, y: rest.y, w: rest.w - width, h: rest.h };
    } else {
      const height = rowSum / rest.w;
      let x = rest.x;
      row.forEach((area) => { rects.push({ x, y: rest.y, w: area / height, h: height }); x += area / height; });
      rest = { x: rest.x, y: rest.y + height, w: rest.w, h: rest.h - height };
    }
    index = next;
  }
  return rects;
}

// Texto blanco u oscuro, el que contraste más con el color de fondo.
function readableTextOn(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.063 ? "#ffffff" : "#1c1f1e";
}

function NavIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const nav: Array<{ id: View; label: string; icon: IconName }> = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "budgets", label: "Presupuesto", icon: "budgets" },
  { id: "payments", label: "Pagos", icon: "expenses" },
  { id: "investors", label: "Inversores", icon: "investors" },
];

// Colores de categoría validados para daltonismo (ver skill dataviz); "Otros" va siempre en gris.
// Tonos suaves (saturación OKLCH ~0.11); el orden está validado para daltonismo entre vecinos.
const categoryColors = ["#2f6ca6", "#ca748f", "#d2ab57", "#009589", "#68549c", "#d58a55", "#9a463a", "#609754"];
// Tipos (mano de obra / materiales / adicionales): tonos del color de la app, para no confundirse con las categorías.
const typeColors: Record<string, string> = { "sub-mano-obra": "#10556c", "sub-materiales": "#3a8fae", "sub-adicionales": "#8cc3d6" };
const otherColor = "#6b6a66";
const trackColor = "#ecebe7";

type ChartSlice = { key: string; label: string; value: number; color: string };
type ChartCenter = { label: string; value: string; note?: string; tone?: "danger" };

// Anillo con segmentos (montos en pesos). Al pasar el mouse o tocar un segmento o una fila
// de la leyenda, se resalta y el centro muestra su monto.
function RingChart({ slices, scale, center, legendExtra, ariaLabel, stacked = false }: { slices: ChartSlice[]; scale: number; center: ChartCenter; legendExtra?: ReactNode; ariaLabel: string; stacked?: boolean }) {
  const [hovered, setHovered] = useState("");
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const visible = slices.filter((slice) => slice.value > 0.5);
  const gap = visible.length > 1 ? 2 : 0;
  const lengths = visible.map((slice) => scale > 0 ? (slice.value / scale) * circumference : 0);
  const arcs = visible.map((slice, index) => ({
    slice,
    length: Math.max(0, lengths[index] - gap),
    offset: lengths.slice(0, index).reduce((sum, value) => sum + value, 0),
  }));
  const active = slices.find((slice) => slice.key === hovered);
  return <div className={`ring-chart ${stacked ? "stacked" : ""}`}>
    <div className="ring-figure" onMouseLeave={() => setHovered("")}>
      <svg viewBox="0 0 200 200" role="img" aria-label={ariaLabel}>
        <circle cx="100" cy="100" r={radius} fill="none" stroke={trackColor} strokeWidth="26" />
        {arcs.map(({ slice, length, offset }) => <circle
          key={slice.key}
          className={`ring-arc ${hovered && hovered !== slice.key ? "dimmed" : ""}`}
          cx="100" cy="100" r={radius} fill="none" stroke={slice.color} strokeWidth="26"
          strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-offset}
          transform="rotate(-90 100 100)"
          onMouseEnter={() => setHovered(slice.key)}
          onClick={() => setHovered(slice.key)}
        />)}
      </svg>
      <div className={`ring-center ${!active && center.tone === "danger" ? "danger" : ""}`}>
        {active ? <><span>{active.label}</span><strong className="ring-amount">{money(active.value, "ARS")}</strong>{scale > 0 && <small>{Math.round((active.value / scale) * 100)}% del total</small>}</> : <><span>{center.label}</span><strong className={center.value.length > 6 ? "ring-amount" : undefined}>{center.value}</strong>{center.note && <small>{center.note}</small>}</>}
      </div>
    </div>
    <ul className="ring-legend">
      {slices.map((slice) => <li key={slice.key} className={hovered === slice.key ? "active" : ""} onMouseEnter={() => setHovered(slice.key)} onMouseLeave={() => setHovered("")}>
        <button type="button" onClick={() => setHovered(slice.key)}>
          <i style={{ background: slice.color }} />
          <span>{slice.label}</span>
          <b>{money(slice.value, "ARS")}</b>
        </button>
      </li>)}
      {legendExtra}
    </ul>
  </div>;
}

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
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const [expandedLineId, setExpandedLineId] = useState<string>("");
  const [expandedPaymentId, setExpandedPaymentId] = useState<string>("");
  const [paymentCategoryFilter, setPaymentCategoryFilter] = useState<string>("");
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>("");
  const [budgetCategoryId, setBudgetCategoryId] = useState<string>("");
  // En el celular el cuadro de rubros es más alto que ancho.
  const narrowScreen = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>("");
  const [selectedContributionId, setSelectedContributionId] = useState<string>("");
  const [expandedInvestorId, setExpandedInvestorId] = useState<string>("");
  const [investmentField, setInvestmentField] = useState<PlanField>("property");
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
    setExpandedLineId("");
    setExpandedInvestorId("");
    setBudgetCategoryId("");
    setPaymentCategoryFilter("");
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
  // payment.expenseId guarda el id de la línea del presupuesto que se pagó.
  const paidFor = (expense: Payable) => data.payments
    .filter((payment) => payment.expenseId === expense.id)
    .reduce((sum, payment) => {
      if (expense.currency === payment.currency) return sum + payment.amount;
      return sum + (expense.currency === "ARS" ? payment.amount * payment.rate : payment.amount / payment.rate);
    }, 0);
  const remainingFor = (expense: Payable) => Math.max(0, expense.amount - paidFor(expense));
  const budgetItems = data.budgetItems ?? [];

  const totals = useMemo(() => {
    const committedArs = budgetItems.reduce((sum, item) => sum + toArs(item.amount, item.currency, item.rate), 0);
    const committedUsd = budgetItems.reduce((sum, item) => sum + toUsd(item.amount, item.currency, item.rate), 0);
    const remainingArs = budgetItems.reduce((sum, item) => sum + toArs(remainingFor(item), item.currency, item.rate), 0);
    const remainingUsd = budgetItems.reduce((sum, item) => sum + toUsd(remainingFor(item), item.currency, item.rate), 0);
    return {
      committedArs,
      committedUsd,
      remainingArs,
      remainingUsd,
      paidArs: committedArs - remainingArs,
      paidUsd: committedUsd - remainingUsd,
      paidPercent: committedArs ? ((committedArs - remainingArs) / committedArs) * 100 : 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  // Costo real: cada pago pasado a dólares con la cotización del día en que se pagó.
  const paidUsdReal = data.payments.reduce((sum, payment) => sum + toUsd(payment.amount, payment.currency, payment.rate), 0);
  const budgetItemArs = (item: BudgetItem) => toArs(item.amount, item.currency, item.rate);
  const budgetTotalArs = budgetItems.reduce((sum, item) => sum + budgetItemArs(item), 0);
  // Cada categoría tiene un color fijo (orden del catálogo entre las que tienen datos), igual en todos los gráficos.
  const usedCategoryIds = data.categories.map((item) => item.id).filter((id) => budgetItems.some((item) => item.categoryId === id));
  const categorySlices = (entries: Array<[string, number]>): ChartSlice[] => {
    const sums = new Map<string, number>();
    entries.forEach(([id, value]) => sums.set(id, (sums.get(id) ?? 0) + value));
    const named = usedCategoryIds.filter((id, index) => sums.has(id) && index < categoryColors.length);
    const slices = named.map((id) => ({ key: id, label: categoryName(id), value: sums.get(id) ?? 0, color: categoryColors[usedCategoryIds.indexOf(id)] }));
    const restIds = [...sums.keys()].filter((id) => !named.includes(id));
    if (restIds.length) slices.push({ key: "other", label: restIds.length === 1 ? categoryName(restIds[0]) : `Otras (${restIds.length})`, value: restIds.reduce((sum, id) => sum + (sums.get(id) ?? 0), 0), color: otherColor });
    return slices;
  };
  const categoryColor = (id: string) => {
    const index = usedCategoryIds.indexOf(id);
    return index >= 0 && index < categoryColors.length ? categoryColors[index] : otherColor;
  };
  const typeSlices = (entries: Array<[string, number]>): ChartSlice[] => {
    const sums = new Map<string, number>();
    entries.forEach(([id, value]) => { if (typeColors[id]) sums.set(id, (sums.get(id) ?? 0) + value); });
    return Object.keys(typeColors).filter((id) => sums.has(id)).map((id) => ({ key: id, label: subcategoryName(id), value: sums.get(id) ?? 0, color: typeColors[id] }));
  };
  // Cotización del dólar para una fecha (el historial está ordenado de la más nueva a la más vieja).
  const rateForDate = (date: string) => {
    const history = data.exchangeRateHistory ?? [];
    return (history.find((item) => item.date <= date) ?? history[history.length - 1])?.rate ?? rate;
  };
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

  const deleteBudgetItem = (item: BudgetItem) => {
    const relatedPayments = data.payments.filter((payment) => payment.expenseId === item.id);
    const detail = relatedPayments.length ? ` También se eliminarán ${relatedPayments.length} pago${relatedPayments.length === 1 ? "" : "s"} registrado${relatedPayments.length === 1 ? "" : "s"}.` : "";
    if (!window.confirm(`¿Eliminar esta línea del presupuesto? Esta acción no se puede deshacer.${detail}`)) return false;
    setData((current) => ({
      ...current,
      budgetItems: (current.budgetItems ?? []).filter((entry) => entry.id !== item.id),
      payments: current.payments.filter((payment) => payment.expenseId !== item.id),
    }));
    setExpandedLineId("");
    notify("Línea eliminada del presupuesto");
    return true;
  };

  const deletePayment = (payment: Payment) => {
    if (!window.confirm(`¿Eliminar el pago de ${money(payment.amount, payment.currency)} del ${shortDate(payment.date)}? Esta acción no se puede deshacer.`)) return;
    setData((current) => ({ ...current, payments: current.payments.filter((item) => item.id !== payment.id) }));
    notify("Pago eliminado");
  };

  const openPaymentModal = () => {
    if (!budgetItems.some((item) => remainingFor(item) > 0.005)) {
      notify(budgetItems.length ? "Todo el presupuesto ya está pagado" : "Primero cargá el presupuesto");
      return;
    }
    setModal("payment");
  };

  // Barra de la inversión (en Inversores): la venta proyectada partida en propiedad, remodelación y ganancia.
  const renderInvestmentStrip = () => {
    const plan = data.investmentPlan;
    const propertyTotalUsd = propertyCostWithCommission(plan.propertyValueUsd, plan.propertyCommissionPercent);
    const editPlan = (field: PlanField) => { setInvestmentField(field); setModal("investmentPlan"); };
    // Ganancia del proyecto = venta proyectada − (propiedad con comisiones + remodelación proyectada).
    const investedUsd = propertyTotalUsd + plan.remodelBudgetUsd;
    const profitUsd = plan.projectedSalePriceUsd - investedUsd;
    const stripScale = Math.max(plan.projectedSalePriceUsd, investedUsd);
    const stripSegments = [
      { key: "property", label: "Propiedad", value: propertyTotalUsd, color: "#10556c", field: "property" as PlanField },
      { key: "remodel", label: "Remodelación", value: plan.remodelBudgetUsd, color: "#8cc3d6", field: "remodel" as PlanField },
      { key: "profit", label: "Ganancia", value: Math.max(0, profitUsd), color: "#2b7a55", field: null },
    ];
    return <section className="panel investment-strip">
        <div className="strip-head">
          <div><h2>La inversión</h2></div>
          <div className={`strip-profit ${profitUsd < 0 ? "negative" : ""}`}>
            <span>{profitUsd < 0 ? "Pérdida del proyecto" : "Ganancia del proyecto"}</span>
            <strong>{plan.projectedSalePriceUsd > 0 ? money(Math.abs(profitUsd), "USD") : "—"}</strong>
            {plan.projectedSalePriceUsd > 0 && investedUsd > 0 && <small>{Math.round((profitUsd / investedUsd) * 100)}% sobre lo invertido</small>}
          </div>
        </div>
        {stripScale > 0 && <div className="strip-bar" role="img" aria-label={`Propiedad ${money(propertyTotalUsd, "USD")}, remodelación ${money(plan.remodelBudgetUsd, "USD")}, venta proyectada ${money(plan.projectedSalePriceUsd, "USD")}`}>
          {stripSegments.filter((segment) => segment.value > 0.5).map((segment) => <button type="button" key={segment.key} style={{ width: `${(segment.value / stripScale) * 100}%`, background: segment.color }}
            title={`${segment.label}: ${money(segment.value, "USD")}`} onClick={() => editPlan(segment.field ?? "sale")} />)}
          {profitUsd < 0 && plan.projectedSalePriceUsd > 0 && <span className="strip-sale-mark" style={{ left: `${(plan.projectedSalePriceUsd / stripScale) * 100}%` }} title="Venta proyectada" />}
        </div>}
        <div className="strip-legend">
          {stripSegments.slice(0, 2).map((segment) => <button type="button" key={segment.key} onClick={() => editPlan(segment.field ?? "sale")}><i style={{ background: segment.color }} />{segment.label}<b>{money(segment.value, "USD")}</b></button>)}
          {profitUsd > 0 && <span className="strip-legend-item"><i style={{ background: stripSegments[2].color }} />Ganancia</span>}
          <button type="button" className="strip-sale" onClick={() => editPlan("sale")}>Venta proyectada<b>{money(plan.projectedSalePriceUsd, "USD")}</b></button>
        </div>
      </section>;
  };

  const renderHome = () => {
    const pendingPercent = Math.max(0, 100 - totals.paidPercent);
    return <div className="page-content home-view">
      <header className="simple-heading"><h1>Inicio</h1></header>

      <section className="home-actions" aria-label="Acciones">
        <button className="action-card" onClick={() => { setSelectedBudgetItemId(""); setModal("budgetItem"); }}>
          <span className="action-icon"><NavIcon name="budgets" /></span>
          <b>Agregar al presupuesto</b>
        </button>
        <button className="action-card" onClick={openPaymentModal}>
          <span className="action-icon"><NavIcon name="check" /></span>
          <b>Registrar pago</b>
        </button>
      </section>

      <section className="panel payment-progress">
        <div className="panel-head">
          <h2>Pagos</h2>
          <button className="text-button" onClick={() => setView("payments")}>Ver pagos</button>
        </div>
        {budgetItems.length === 0 ? <div className="chart-empty">Todavía no cargaste el presupuesto.</div> : <>
          <div className="progress-headline">
            <div><span>Pagado</span><strong>{money(totals.paidArs, "ARS")}</strong></div>
            <small>{Math.round(totals.paidPercent)}% del presupuesto · {money(paidUsdReal, "USD")} en dólares</small>
          </div>
          <div className="progress-meter" role="img" aria-label={`Pagado ${Math.round(totals.paidPercent)}% del presupuesto`}>
            {totals.paidPercent > 0.1 && <span className="paid" style={{ width: `${totals.paidPercent}%` }} title={`Pagado: ${money(totals.paidArs, "ARS")}`} />}
            {pendingPercent > 0.1 && <span className="pending" style={{ width: `${pendingPercent}%` }} title={`Falta pagar: ${money(totals.remainingArs, "ARS")}`} />}
          </div>
          <div className="progress-foot"><span>Falta pagar <b>{money(totals.remainingArs, "ARS")}</b></span><span>Total <b>{money(totals.committedArs, "ARS")}</b></span></div>
        </>}
      </section>

      <section className="panel chart-panel home-budget">
        <div className="panel-head">
          <div><h2>Presupuesto por rubro</h2></div>
          <button className="text-button" onClick={() => setView("budgets")}>Ver presupuesto</button>
        </div>
        {budgetItems.length === 0
          ? <div className="chart-empty">Todavía no cargaste el presupuesto.</div>
          : <RingChart
            ariaLabel="Presupuesto por rubro"
            stacked
            slices={categorySlices(budgetItems.map((item) => [item.categoryId, budgetItemArs(item)]))}
            scale={budgetTotalArs}
            center={{ label: "Total", value: money(budgetTotalArs, "ARS") }}
          />}
      </section>
    </div>;
  };

  const renderPayments = () => {
    const lineFor = (payment: Payment) => budgetItems.find((item) => item.id === payment.expenseId);
    const paymentArs = (payment: Payment) => toArs(payment.amount, payment.currency, payment.rate);
    // Avance de pagos por rubro, a partir de las líneas del presupuesto.
    const byCategory = new Map<string, { total: number; paid: number }>();
    budgetItems.forEach((item) => {
      const current = byCategory.get(item.categoryId) ?? { total: 0, paid: 0 };
      byCategory.set(item.categoryId, { total: current.total + budgetItemArs(item), paid: current.paid + paidArsFor(item) });
    });
    const areas = [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total);
    const visiblePayments = data.payments
      .filter((payment) => !paymentCategoryFilter || lineFor(payment)?.categoryId === paymentCategoryFilter)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const listTotal = visiblePayments.reduce((sum, payment) => sum + paymentArs(payment), 0);
    const selectArea = (id: string) => {
      setPaymentCategoryFilter((current) => current === id ? "" : id);
      setExpandedPaymentId("");
      document.getElementById("pagos-realizados")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return <div className="page-content">
      <SimpleHeading title="Pagos" action="Registrar pago" onAction={openPaymentModal} />
      {budgetItems.length > 0 && <section className="payment-summary">
        <div><span>Pagado</span><strong className="paid">{money(totals.paidArs, "ARS")}</strong><small>{Math.round(totals.paidPercent)}% · equivale a {money(paidUsdReal, "USD")}</small></div>
        <div><span>Falta pagar</span><strong className="pending">{money(totals.remainingArs, "ARS")}</strong></div>
        <div><span>Total del presupuesto</span><strong>{money(totals.committedArs, "ARS")}</strong></div>
      </section>}

      {areas.length > 0 && <section className="payment-areas-section">
        <h2>Por rubro</h2>
        <div className="payment-areas">{areas.map(([id, value]) => {
          const paidPercent = value.total ? Math.round((value.paid / value.total) * 100) : 0;
          return <button type="button" key={id} className={`payment-area ${paymentCategoryFilter === id ? "active" : ""}`} aria-pressed={paymentCategoryFilter === id} onClick={() => selectArea(id)}>
            <span className="payment-area-head"><span><i style={{ background: categoryColor(id) }} />{categoryName(id)}</span><b>{paidPercent}%</b></span>
            <span className="area-bar"><span style={{ width: `${paidPercent}%`, background: categoryColor(id) }} /></span>
            <span className="payment-area-numbers"><span>Pagado <b>{money(value.paid, "ARS")}</b></span><span>Falta <b>{money(Math.max(0, value.total - value.paid), "ARS")}</b></span></span>
          </button>;
        })}</div>
      </section>}

      {data.payments.length === 0
        ? <EmptyState title="Todavía no hay pagos" copy="Cuando pagues algo del presupuesto, registralo acá. Cada pago se pasa a dólares con la cotización de ese día." action="Registrar pago" onAction={openPaymentModal} />
        : <section className="history-block" id="pagos-realizados">
          <div className="history-head">
            <h2>Pagos realizados</h2>
            {paymentCategoryFilter && <button className="filter-chip" onClick={() => setPaymentCategoryFilter("")}>{categoryName(paymentCategoryFilter)} ✕</button>}
          </div>
          {visiblePayments.length === 0 ? <div className="inline-empty">Todavía no hay pagos en este rubro.</div> : <div className="payment-list">
            {visiblePayments.map((payment) => {
              const line = lineFor(payment);
              const note = [line?.description, payment.description].filter(Boolean).join(" · ");
              const expanded = expandedPaymentId === payment.id;
              return <article className={`payment-item ${expanded ? "expanded" : ""}`} key={payment.id}>
                <button type="button" className="payment-item-row" aria-expanded={expanded} onClick={() => setExpandedPaymentId((current) => current === payment.id ? "" : payment.id)}>
                  <span className="date">{dayMonth(payment.date)}</span>
                  <span className="concept"><b>{line ? pathName(line.categoryId, line.subcategoryId) : "Línea eliminada"}</b>{note && <small>{note}</small>}</span>
                  <strong>{money(payment.amount, payment.currency)}</strong>
                </button>
                {expanded && <div className="payment-item-detail">
                  <dl>
                    <div><dt>Fecha</dt><dd>{shortDate(payment.date)}</dd></div>
                    {payment.currency === "ARS" && <div><dt>Dólar del día</dt><dd>{money(payment.rate, "ARS")}</dd></div>}
                    <div><dt>{payment.currency === "ARS" ? "En dólares" : "En pesos"}</dt><dd>{payment.currency === "ARS" ? money(toUsd(payment.amount, payment.currency, payment.rate), "USD") : money(paymentArs(payment), "ARS")}</dd></div>
                  </dl>
                  <button className="danger-button compact" onClick={() => deletePayment(payment)}>Eliminar pago</button>
                </div>}
              </article>;
            })}
            <div className="payment-list-total"><span>Total pagado{paymentCategoryFilter ? ` en ${categoryName(paymentCategoryFilter)}` : ""}</span><strong>{money(listTotal, "ARS")}</strong></div>
          </div>}
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

  const lineStatus = (item: BudgetItem) => {
    const remaining = remainingFor(item);
    if (remaining <= 0.005) return <small className="paid">✓ Pagado</small>;
    if (paidFor(item) > 0.005) return <small className="balance">Pago parcial · falta {money(remaining, item.currency)}</small>;
    return <small className="unpaid">Sin pagar</small>;
  };
  const paidArsFor = (item: BudgetItem) => toArs(paidFor(item), item.currency, item.rate);

  const renderBudgetLine = (item: BudgetItem) => {
    const expanded = expandedLineId === item.id;
    return <article className={`budget-entry ${expanded ? "expanded" : ""}`} key={item.id}>
      <button type="button" className="budget-item-row" aria-expanded={expanded} onClick={() => setExpandedLineId((current) => current === item.id ? "" : item.id)}>
        <span><b>{item.description || "Sin descripción"}</b></span>
        <span className="budget-item-amounts"><strong>{money(item.amount, item.currency)}</strong>{lineStatus(item)}</span>
      </button>
      {expanded && <div className="budget-entry-detail"><InlinePaymentForm
        expense={item}
        rateFor={rateForDate}
        remaining={remainingFor(item)}
        payments={data.payments.filter((payment) => payment.expenseId === item.id)}
        removePayment={deletePayment}
        edit={() => { setSelectedBudgetItemId(item.id); setModal("budgetItem"); }}
        remove={() => deleteBudgetItem(item)}
        save={(payment) => {
          setData((current) => ({ ...current, payments: [...current.payments, payment] }));
          notify("Pago registrado");
        }}
      /></div>}
    </article>;
  };

  const renderBudgetCategory = (categoryId: string) => {
    const items = budgetItems.filter((item) => item.categoryId === categoryId);
    const total = items.reduce((sum, item) => sum + budgetItemArs(item), 0);
    const paid = items.reduce((sum, item) => sum + paidArsFor(item), 0);
    const groups = [...Object.keys(typeColors), ""]
      .map((typeId) => ({ typeId, items: items.filter((item) => (typeColors[item.subcategoryId] ? item.subcategoryId : "") === typeId) }))
      .filter((group) => group.items.length > 0);
    return <>
      <button className="text-button back-link" onClick={() => { setBudgetCategoryId(""); setExpandedLineId(""); }}>← Todo el presupuesto</button>
      <section className="category-head">
        <div><span className="category-dot" style={{ background: categoryColor(categoryId) }} /><h2>{categoryName(categoryId)}</h2></div>
        <button className="secondary-button" onClick={() => { setSelectedBudgetItemId(""); setModal("budgetItem"); }}>＋ Agregar a {categoryName(categoryId)}</button>
      </section>
      <p className="category-summary">Presupuestado <b>{money(total, "ARS")}</b> · Pagado <b>{money(paid, "ARS")}</b> ({total ? Math.round((paid / total) * 100) : 0}%) · Falta <b>{money(Math.max(0, total - paid), "ARS")}</b></p>
      {groups.length === 0 ? <div className="inline-empty">No quedan líneas en este rubro.</div> : groups.map((group) => <section className="type-group" key={group.typeId || "none"}>
        <div className="type-group-head">
          <h3>{group.typeId ? subcategoryName(group.typeId) : "Sin tipo (editá la línea para elegir uno)"}</h3>
          <span>{money(group.items.reduce((sum, item) => sum + budgetItemArs(item), 0), "ARS")}</span>
        </div>
        <div className="budget-item-list">{group.items.slice().sort((a, b) => budgetItemArs(b) - budgetItemArs(a)).map(renderBudgetLine)}</div>
      </section>)}
    </>;
  };

  const renderBudgets = () => {
    const addItem = () => { setSelectedBudgetItemId(""); setModal("budgetItem"); };
    const typedTotal = budgetItems.filter((item) => typeColors[item.subcategoryId]).reduce((sum, item) => sum + budgetItemArs(item), 0);
    const untypedTotal = budgetTotalArs - typedTotal;
    const sums = new Map<string, { total: number; paid: number }>();
    budgetItems.forEach((item) => {
      const current = sums.get(item.categoryId) ?? { total: 0, paid: 0 };
      sums.set(item.categoryId, { total: current.total + budgetItemArs(item), paid: current.paid + paidArsFor(item) });
    });
    const tiles = [...sums.entries()].sort((a, b) => b[1].total - a[1].total);
    const box = narrowScreen ? treemapBoxNarrow : treemapBox;
    const rects = squarify(tiles.map(([, value]) => value.total), box);
    const openCategory = (id: string) => { setBudgetCategoryId(id); setExpandedLineId(""); window.scrollTo({ top: 0 }); };
    return <div className="page-content">
      <SimpleHeading title="Presupuesto" action="Agregar al presupuesto" onAction={addItem} />
      {budgetItems.length === 0 ? <EmptyState title="Todavía no cargaste el presupuesto" copy="Anotá lo que pensás gastar en cada rubro (contratista, electricista…) y si es mano de obra, materiales o adicionales." action="Agregar al presupuesto" onAction={addItem} /> : <>
        <section className="budget-total">
          <strong>{money(budgetTotalArs, "ARS")}</strong>
          <small>Pagado hasta hoy: {money(totals.paidArs, "ARS")} ({Math.round(totals.paidPercent)}%) · falta pagar {money(totals.remainingArs, "ARS")}</small>
        </section>
        {budgetCategoryId ? renderBudgetCategory(budgetCategoryId) : <>
          <section className="home-charts">
            <article className="panel chart-panel">
              <div className="panel-head"><div><h2>Por rubro</h2></div></div>
              <RingChart ariaLabel="Presupuesto por rubro" slices={categorySlices(budgetItems.map((item) => [item.categoryId, budgetItemArs(item)]))} scale={budgetTotalArs} center={{ label: "Total", value: money(budgetTotalArs, "ARS") }} />
            </article>
            <article className="panel chart-panel">
              <div className="panel-head"><div><h2>Por tipo</h2></div></div>
              <RingChart ariaLabel="Presupuesto por tipo" slices={typeSlices(budgetItems.map((item) => [item.subcategoryId, budgetItemArs(item)]))} scale={typedTotal} center={{ label: "Total", value: money(typedTotal, "ARS") }}
                legendExtra={untypedTotal > 0.5 ? <li className="legend-note">{money(untypedTotal, "ARS")} todavía no tienen tipo: elegíselo desde el detalle del rubro.</li> : undefined} />
            </article>
          </section>
          <section className="budget-items">
            <h2>Detalle por rubro</h2>
            <div className="treemap">{tiles.map(([id, value], index) => {
              const rect = rects[index];
              const color = categoryColor(id);
              const size = rect.w / box.w < 0.11 || rect.h / box.h < 0.13 ? "tiny" : rect.w / box.w < 0.22 || rect.h / box.h < 0.22 ? "small" : "";
              const paidPercent = value.total ? Math.round((value.paid / value.total) * 100) : 0;
              return <button type="button" key={id} className={`treemap-tile ${size}`} onClick={() => openCategory(id)}
                title={`${categoryName(id)}: ${money(value.total, "ARS")} · pagado ${paidPercent}%`}
                style={{ left: `${(rect.x / box.w) * 100}%`, top: `${(rect.y / box.h) * 100}%`, width: `${(rect.w / box.w) * 100}%`, height: `${(rect.h / box.h) * 100}%`, background: color, color: readableTextOn(color) }}>
                <b>{categoryName(id)}</b>
                <span>{money(value.total, "ARS")}</span>
                <small>Pagado {paidPercent}%</small>
              </button>;
            })}</div>
            <div className="expenses-footer"><button className="text-button" onClick={() => setView("categories")}>Administrar categorías</button></div>
          </section>
        </>}
      </>}

      {!budgetCategoryId && <section className="comparisons">
        <div className="section-head">
          <div><h2>Comparar proveedores</h2></div>
          <button className="secondary-button" onClick={() => setModal("budget")}>＋ Nueva comparación</button>
        </div>
        {data.budgetGroups.length === 0 ? <div className="inline-empty">No hay comparaciones. Creá una, por ejemplo “sanitarios del baño”, y cargá las ofertas.</div> : (
        <div className="budget-groups">{data.budgetGroups.map((group) => {
          const amounts = group.offers.map((offer) => toArs(offer.amount, offer.currency, offer.rate));
          const cheapest = amounts.length ? Math.min(...amounts) : 0;
          const approved = group.offers.find((offer) => offer.id === group.approvedOfferId);
          return <section className="budget-group" key={group.id}>
            <div className="budget-group-head"><div><span className="soft-label">{pathName(group.categoryId, group.subcategoryId)}</span><h2>{group.name}</h2></div><div className="budget-head-actions">{approved && <span className="approved-pill">✓ Elegido: {approved.supplier}</span>}<button className="secondary-button" onClick={() => { setSelectedBudgetId(group.id); setModal("offer"); }}>＋ Agregar oferta</button><button className="danger-button compact" onClick={() => deleteBudgetGroup(group)}>Eliminar</button></div></div>
            {group.offers.length === 0 ? <div className="inline-empty">Todavía no hay ofertas en esta comparación.</div> : <div className="offers-grid">{group.offers.map((offer) => {
              const ars = toArs(offer.amount, offer.currency, offer.rate);
              const isApproved = offer.id === group.approvedOfferId;
              const isCheapest = Math.abs(ars - cheapest) < 0.01;
              const diff = cheapest ? ((ars - cheapest) / cheapest) * 100 : 0;
              return <article className={`offer-card ${isApproved ? "approved" : isCheapest ? "cheapest" : "higher"}`} key={offer.id} title={isCheapest ? "Es la oferta más económica" : `${Math.round(diff)}% por encima de la oferta más económica`}>
                <div className="offer-top"><span>{isApproved ? "Elegido" : isCheapest ? "Mejor precio" : `+${Math.round(diff)}%`}</span><time>{shortDate(offer.date)}</time></div>
                <h3>{offer.supplier}</h3><p>{offer.description || "Sin descripción adicional"}</p>
                <strong>{money(offer.amount, offer.currency)}</strong><small>{offer.currency === "ARS" ? money(toUsd(offer.amount, offer.currency, offer.rate), "USD") : money(ars, "ARS")} · dólar {money(offer.rate, "ARS")}</small>
                {!group.approvedOfferId && <button className="primary-button full" onClick={() => approveOffer(group.id, offer.id)}>Elegir y sumar al presupuesto</button>}
              </article>;
            })}</div>}
          </section>;
        })}</div>
        )}
      </section>}
    </div>;
  };

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
    const investorProfit = data.investors.reduce((sum, investor) => sum + investor.profitUsd, 0);
    const ownMoney = plan.ownCapitalUsd;
    // Tu ganancia = ganancia del proyecto (venta − propiedad con comisiones − remodelación) − lo que se les da a los inversores.
    const projectProfit = plan.projectedSalePriceUsd - propertyCostWithCommission(plan.propertyValueUsd, plan.propertyCommissionPercent) - plan.remodelBudgetUsd;
    const ownerProfit = projectProfit - investorProfit;
    const editPlan = (field: PlanField) => { setInvestmentField(field); setModal("investmentPlan"); };
    const addInvestor = () => { setSelectedInvestorId(""); setModal("investor"); };
    return <div className="page-content">
      <SimpleHeading title="Inversores" action="Nuevo inversor" onAction={addInvestor} />

      {renderInvestmentStrip()}

      <section className="funding-group"><span className="funding-group-label">Tu parte</span><div className="investment-plan-grid own-funding-summary">
        <button type="button" className="plan-card" onClick={() => editPlan("own")}><span>Plata propia</span><strong>{money(ownMoney, "USD")}</strong></button>
        <div className={`plan-card static ${ownerProfit < 0 ? "negative" : "positive"}`} title="Ganancia del proyecto − ganancia de los inversores"><span>Tu ganancia</span><strong>{plan.projectedSalePriceUsd > 0 ? money(ownerProfit, "USD") : "—"}</strong></div>
      </div></section>

      <section className="funding-group"><span className="funding-group-label">Inversores{data.investors.length > 0 ? " · tocá uno para ver el detalle" : ""}</span>
        {data.investors.length === 0 ? <div className="inline-empty">Todavía no hay inversores.<button className="text-button" onClick={addInvestor}>＋ Agregar inversor</button></div> : <div className="investor-list">
          <div className="investor-row head"><span>Inversor</span><span className="num">Invirtió</span><span className="num">Ganancia acordada</span></div>
          {data.investors.map((investor) => {
            const metrics = investorMetrics(investor, plan.projectedSaleDate);
            const expanded = expandedInvestorId === investor.id;
            const contributions = investor.contributions.slice().sort((a, b) => a.date.localeCompare(b.date));
            return <Fragment key={investor.id}>
              <button type="button" className={`investor-row ${expanded ? "expanded" : ""}`} aria-expanded={expanded} onClick={() => setExpandedInvestorId((current) => current === investor.id ? "" : investor.id)}>
                <span><b>{investor.name}</b></span>
                <span className="num">{money(metrics.capital, "USD")}</span>
                <span className="num profit">{money(investor.profitAmount ?? investor.profitUsd, investor.profitCurrency ?? "USD")}</span>
              </button>
              {expanded && <div className="investor-detail">
                <div className="investor-detail-stats">
                  <span>Total a devolver<b>{money(metrics.capital + investor.profitUsd, "USD")}</b></span>
                  <span>Ganancia<b>{percent(metrics.totalReturnPercent)}</b></span>
                  <span>Tasa anual simple<b>{metrics.annualRate === null ? metrics.annualRateStatus : percent(metrics.annualRate)}</b></span>
                  <span>Plazo<b>{metrics.termDays ? `${Math.round(metrics.termDays)} días` : "—"}</b></span>
                </div>
                <div className="investor-contributions">
                  <span>Aportes (tocá uno para editarlo)</span>
                  {contributions.length === 0 ? <small>Sin aportes</small> : contributions.map((contribution) => <button type="button" key={contribution.id} onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(contribution.id); setModal("contribution"); }}>
                    <span>{shortDate(contribution.date)}</span><b>{money(contribution.amount, contribution.currency ?? "USD")}</b>
                  </button>)}
                </div>
                <div className="investor-actions">
                  <button className="row-payment-button" onClick={() => { setSelectedInvestorId(investor.id); setSelectedContributionId(""); setModal("contribution"); }}>＋ Aporte</button>
                  <button className="mini-button" onClick={() => { setSelectedInvestorId(investor.id); setModal("investor"); }}>Editar</button>
                  <button className="danger-button compact" onClick={() => deleteInvestor(investor)}>Eliminar</button>
                </div>
                <small className="investor-note">Tasa anual simple: ganancia % × 365 ÷ días hasta la venta, sin reinversión.</small>
              </div>}
            </Fragment>;
          })}
          <div className="investor-row total"><span>Total</span><span className="num">{money(investorCapitalTotal, "USD")}</span><span className="num">{money(investorProfit, "USD")}</span></div>
        </div>}
      </section>
    </div>;
  };

  const renderCategories = () => (
    <div className="page-content">
      <button className="text-button back-link" onClick={() => setView("budgets")}>← Volver al presupuesto</button>
      <SimpleHeading title="Categorías" />
      <section className="manage-card category-catalog">
        <div className="manage-head"><h2>Categorías del presupuesto</h2><button className="secondary-button" onClick={() => addNamedItem("category")}>＋ Agregar categoría</button></div>
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
    const item: BudgetItem = {
      id: uid("bitem"), categoryId: group.categoryId, subcategoryId: group.subcategoryId, description: `${group.name} — ${offer.supplier}`,
      amount: offer.amount, currency: offer.currency, rate: offer.rate, comparisonId: group.id,
    };
    setData((current) => ({
      ...current,
      budgetGroups: current.budgetGroups.map((entry) => entry.id === groupId ? { ...entry, approvedOfferId: offerId } : entry),
      budgetItems: [...(current.budgetItems ?? []), item],
    }));
    notify("Oferta elegida y sumada al presupuesto");
  };

  const deleteBudgetGroup = (group: BudgetGroup) => {
    const approved = group.offers.find((offer) => offer.id === group.approvedOfferId);
    const note = approved ? " Lo que ya se sumó al presupuesto se conserva." : "";
    if (!window.confirm(`¿Eliminar la comparación “${group.name}” y todas sus ofertas?${note}`)) return;
    setData((current) => ({ ...current, budgetGroups: current.budgetGroups.filter((item) => item.id !== group.id) }));
    notify("Comparación eliminada");
  };

  const renameItem = (collection: "categories" | "subcategories", item: Category) => {
    const name = window.prompt("Nuevo nombre", item.name)?.trim();
    if (!name) return;
    setData((current) => ({ ...current, [collection]: current[collection].map((entry) => entry.id === item.id ? { ...entry, name } : entry) }));
  };
  const deleteCreatedItem = (collection: "categories" | "subcategories", item: Category) => {
    const isCategory = collection === "categories";
    const hasReferences = isCategory
      ? data.progress.some((entry) => entry.categoryId === item.id) || data.budgetGroups.some((entry) => entry.categoryId === item.id) || budgetItems.some((entry) => entry.categoryId === item.id)
      : data.progress.some((entry) => entry.subcategoryId === item.id) || data.budgetGroups.some((entry) => entry.subcategoryId === item.id) || budgetItems.some((entry) => entry.subcategoryId === item.id);
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

  // ---------- Asistente: describe y aplica lo que propone el chat ----------
  const assistantTypeIds: Record<string, string> = { mano_de_obra: "sub-mano-obra", materiales: "sub-materiales", adicionales: "sub-adicionales" };
  const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const findCategoryByName = (list: Category[], name?: string) => name ? list.find((item) => !item.archived && normalizeName(item.name) === normalizeName(name)) : undefined;
  const actionDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today();
  const dateLabel = (value: string) => value === today() ? "hoy" : shortDate(value);
  const lineLabel = (line: BudgetItem) => [pathName(line.categoryId, line.subcategoryId), line.description].filter(Boolean).join(" · ");
  // Si el pago no dice monto, se paga todo lo que falta de esa línea.
  const paymentFromAction = (action: AssistantAction, line: BudgetItem) => {
    const hasAmount = Number(action.monto) > 0;
    const currency: Currency = hasAmount ? action.moneda ?? line.currency : line.currency;
    return { amount: hasAmount ? Number(action.monto) : remainingFor(line), currency, date: actionDate(action.fecha) };
  };

  const assistantContext = () => ({
    hoy: today(),
    dia_de_la_semana: new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(new Date()),
    ayer: yesterday(),
    dolar_hoy: rate,
    rubros: categories.map((item) => item.name),
    presupuesto: budgetItems.map((item) => ({
      id: item.id,
      // Nombre legible para mostrarle al usuario (nunca el id).
      nombre: [categoryName(item.categoryId), subcategoryName(item.subcategoryId), item.description || `presupuesto de ${money(item.amount, item.currency)}`].filter(Boolean).join(" · "),
      rubro: categoryName(item.categoryId),
      tipo: subcategoryName(item.subcategoryId),
      descripcion: item.description,
      monto: item.amount,
      moneda: item.currency,
      falta: Math.round(remainingFor(item) * 100) / 100,
      con_saldo: remainingFor(item) > 0.005,
    })),
    presupuesto_total_ars: Math.round(totals.committedArs),
    pagado_total_ars: Math.round(totals.paidArs),
    falta_pagar_total_ars: Math.round(totals.remainingArs),
    pagado_total_en_dolares_al_dia_de_cada_pago: Math.round(paidUsdReal * 100) / 100,
    propiedad_usd: data.investmentPlan.propertyValueUsd,
    comisiones_pct: data.investmentPlan.propertyCommissionPercent,
    fecha_compra: data.investmentPlan.purchaseDate,
    venta_proyectada_usd: data.investmentPlan.projectedSalePriceUsd,
    fecha_venta: data.investmentPlan.projectedSaleDate,
    remodelacion_proyectada_usd: data.investmentPlan.remodelBudgetUsd,
    plata_propia_usd: data.investmentPlan.ownCapitalUsd,
    inversores: data.investors.map((item) => item.name),
  });

  const describeAction = (action: AssistantAction): ActionPreview => {
    const amount = Number(action.monto);
    switch (action.tipo) {
      case "agregar_presupuesto": {
        const typeId = action.tipo_gasto ? assistantTypeIds[action.tipo_gasto] : undefined;
        const category = findCategoryByName(data.categories, action.rubro);
        const currency: Currency = action.moneda === "USD" ? "USD" : "ARS";
        return {
          text: `Agregar al presupuesto: ${category?.name ?? action.rubro ?? "?"} · ${typeId ? subcategoryName(typeId) : "?"} — ${money(amount, currency)}${action.descripcion ? ` (${action.descripcion})` : ""}${!category && action.rubro ? " · rubro nuevo" : ""}`,
          problem: !action.rubro ? "Falta el rubro." : !typeId ? "Falta si es mano de obra, materiales o adicionales." : !(amount > 0) ? "Falta el monto." : undefined,
        };
      }
      case "registrar_pago": {
        const line = budgetItems.find((item) => item.id === action.linea_id);
        if (!line) return { text: "Registrar un pago", problem: "No encontré esa línea del presupuesto." };
        const payment = paymentFromAction(action, line);
        const remaining = remainingFor(line);
        return {
          text: `Registrar pago de ${money(payment.amount, payment.currency)} — ${lineLabel(line)} — ${dateLabel(payment.date)}${action.nota ? ` (${action.nota})` : ""}`,
          problem: remaining <= 0.005 ? "Esa línea ya está pagada." : payment.currency === line.currency && payment.amount > remaining + 0.005 ? `Supera lo que falta (${money(remaining, line.currency)}).` : undefined,
        };
      }
      case "actualizar_propiedad":
        return {
          text: `Propiedad: ${amount > 0 ? money(amount, "USD") : "mismo valor"}${Number.isFinite(action.comisiones_pct) ? ` · comisiones ${percent(Number(action.comisiones_pct))}` : ""}${action.fecha ? ` · comprada el ${shortDate(actionDate(action.fecha))}` : ""}`,
          problem: !(amount > 0) && !Number.isFinite(action.comisiones_pct) && !action.fecha ? "No hay ningún dato para cambiar." : undefined,
        };
      case "actualizar_venta":
        return {
          text: `Venta proyectada: ${amount > 0 ? money(amount, "USD") : "mismo precio"}${action.fecha ? ` · fecha estimada ${shortDate(actionDate(action.fecha))}` : ""}`,
          problem: !(amount > 0) && !action.fecha ? "No hay ningún dato para cambiar." : undefined,
        };
      case "actualizar_remodelacion":
        return { text: `Remodelación proyectada: ${money(amount, "USD")}`, problem: amount > 0 ? undefined : "Falta el monto." };
      case "actualizar_plata_propia":
        return { text: `Plata propia: ${money(amount, "USD")}`, problem: amount > 0 ? undefined : "Falta el monto." };
      case "agregar_inversor":
        return {
          text: `Nuevo inversor: ${action.nombre ?? "?"} — invirtió ${money(amount, action.moneda ?? "USD")}, ganancia ${money(Number(action.ganancia) || 0, action.moneda_ganancia ?? "USD")}${action.fecha ? ` · ${dateLabel(actionDate(action.fecha))}` : ""}`,
          problem: !action.nombre?.trim() ? "Falta el nombre." : !(amount > 0) ? "Falta cuánto invirtió." : undefined,
        };
      default:
        return { text: "Acción desconocida", problem: "Esto no lo puedo cargar." };
    }
  };

  const applyAssistantActions = (actions: AssistantAction[]) => {
    if (!actions.length) return;
    setData((current) => {
      const categoriesNext = [...current.categories];
      const itemsNext = [...(current.budgetItems ?? [])];
      const paymentsNext = [...current.payments];
      const investorsNext = [...current.investors];
      const plan = { ...current.investmentPlan };
      actions.forEach((action) => {
        const amount = Number(action.monto);
        if (action.tipo === "agregar_presupuesto" && action.rubro && action.tipo_gasto && amount > 0) {
          let category = findCategoryByName(categoriesNext, action.rubro);
          if (!category) {
            category = { id: uid("cat"), name: action.rubro.trim(), archived: false, subcategoryIds: [] };
            categoriesNext.push(category);
          }
          itemsNext.push({ id: uid("bitem"), categoryId: category.id, subcategoryId: assistantTypeIds[action.tipo_gasto], description: action.descripcion?.trim() ?? "", amount, currency: action.moneda === "USD" ? "USD" : "ARS", rate });
        }
        if (action.tipo === "registrar_pago") {
          const line = itemsNext.find((item) => item.id === action.linea_id);
          if (line) {
            const payment = paymentFromAction(action, line);
            if (payment.amount > 0) paymentsNext.push({ id: uid("pay"), expenseId: line.id, date: payment.date, description: action.nota?.trim() ?? "", amount: payment.amount, currency: payment.currency, rate: rateForDate(payment.date) });
          }
        }
        if (action.tipo === "actualizar_propiedad") {
          if (amount > 0) plan.propertyValueUsd = amount;
          if (Number.isFinite(action.comisiones_pct)) plan.propertyCommissionPercent = Math.max(0, Number(action.comisiones_pct));
          if (action.fecha) plan.purchaseDate = actionDate(action.fecha);
        }
        if (action.tipo === "actualizar_venta") {
          if (amount > 0) plan.projectedSalePriceUsd = amount;
          if (action.fecha) plan.projectedSaleDate = actionDate(action.fecha);
        }
        if (action.tipo === "actualizar_remodelacion" && amount > 0) plan.remodelBudgetUsd = amount;
        if (action.tipo === "actualizar_plata_propia" && amount > 0) { plan.ownCapitalUsd = amount; plan.ownCapitalManual = true; }
        if (action.tipo === "agregar_inversor" && action.nombre?.trim() && amount > 0) {
          const date = actionDate(action.fecha);
          const profit = Number(action.ganancia) || 0;
          const profitCurrency: Currency = action.moneda_ganancia ?? "USD";
          investorsNext.push({
            id: uid("investor"), name: action.nombre.trim(),
            profitUsd: toUsd(profit, profitCurrency, rate), profitAmount: profit, profitCurrency, profitRate: rate,
            contributions: [{ id: uid("contribution"), date, amount, currency: action.moneda ?? "USD", rate: rateForDate(date) }],
          });
        }
      });
      return { ...current, categories: categoriesNext, budgetItems: itemsNext, payments: paymentsNext, investors: investorsNext, investmentPlan: plan };
    });
    notify(actions.length === 1 ? "Listo, quedó cargado" : `Listo, se cargaron ${actions.length} cosas`);
  };

  if (!loaded) return <div className="app-loading"><h1>Control de Obra</h1><p>Preparando tus datos…</p></div>;

  const activeNav = view === "categories" ? "budgets" : view;
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
        {view === "payments" && renderPayments()}
        {view === "budgets" && renderBudgets()}
        {view === "investors" && renderInvestors()}
        {view === "categories" && renderCategories()}
      </section>

      <nav className="bottom-nav">{nav.map((item) => <button key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => setView(item.id)}><NavIcon name={item.icon} /><small>{item.label}</small></button>)}</nav>

      {modal === "budgetItem" && <BudgetItemModal data={data} rate={rate} item={budgetItems.find((item) => item.id === selectedBudgetItemId)} defaultCategoryId={budgetCategoryId} categoryColor={categoryColor} addNamedItem={addNamedItem}
        remove={() => {
          const item = budgetItems.find((entry) => entry.id === selectedBudgetItemId);
          if (item && deleteBudgetItem(item)) { setModal(null); setSelectedBudgetItemId(""); }
        }}
        close={() => { setModal(null); setSelectedBudgetItemId(""); }}
        save={(item) => {
          setData((current) => {
            const items = current.budgetItems ?? [];
            return { ...current, budgetItems: items.some((entry) => entry.id === item.id) ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item] };
          });
          setModal(null); setSelectedBudgetItemId(""); setView("budgets"); notify("Presupuesto guardado");
        }} />}
      {modal === "payment" && <PaymentModal lines={budgetItems} rateFor={rateForDate} initialLineId={selectedLineId} remainingFor={remainingFor} categoryName={categoryName} subcategoryName={subcategoryName} categoryColor={categoryColor} close={() => { setModal(null); setSelectedLineId(""); }} save={(payment) => { setData((current) => ({ ...current, payments: [...current.payments, payment] })); setModal(null); setSelectedLineId(""); notify("Pago registrado"); }} />}
      {modal === "budget" && <BudgetModal categories={categories} subcategories={subcategories} categoryColor={categoryColor} addNamedItem={addNamedItem} close={() => setModal(null)} save={(group) => { setData((current) => ({ ...current, budgetGroups: [...current.budgetGroups, group] })); setSelectedBudgetId(group.id); setView("budgets"); setModal("offer"); notify("Comparación creada"); }} />}
      {modal === "offer" && <OfferModal rate={rate} group={data.budgetGroups.find((item) => item.id === selectedBudgetId)} close={() => { setModal(null); setSelectedBudgetId(""); }} save={(offer) => { setData((current) => ({ ...current, budgetGroups: current.budgetGroups.map((group) => group.id === selectedBudgetId ? { ...group, offers: [...group.offers, offer] } : group) })); setModal(null); setSelectedBudgetId(""); notify("Oferta agregada"); }} />}
      {modal === "rate" && <RateModal rate={rate} date={rateDate} source={rateSource} history={data.exchangeRateHistory ?? []} close={() => setModal(null)} save={(nextRate, nextDate) => { const nextSource = "Cotización ajustada manualmente"; setRate(nextRate); setRateDate(nextDate); setRateSource(nextSource); setData((current) => ({ ...current, exchangeRateHistory: updateRateHistory(current.exchangeRateHistory ?? [], { date: nextDate, rate: nextRate, source: nextSource }) })); setModal(null); notify("Cotización actualizada"); }} />}
      {modal === "investmentPlan" && <InvestmentPlanModal field={investmentField} plan={data.investmentPlan} close={() => setModal(null)} save={(investmentPlan) => { setData((current) => ({ ...current, investmentPlan })); setModal(null); notify("Datos de inversión guardados"); }} />}
      {modal === "investor" && <InvestorModal rate={rate} investor={selectedInvestor} close={() => { setModal(null); setSelectedInvestorId(""); }} save={(investor) => {
        setData((current) => ({ ...current, investors: current.investors.some((item) => item.id === investor.id) ? current.investors.map((item) => item.id === investor.id ? investor : item) : [...current.investors, investor] }));
        setModal(null); setSelectedInvestorId(""); notify("Inversor guardado");
      }} />}
      {modal === "contribution" && <ContributionModal rate={rate} investor={selectedInvestor} contribution={selectedContribution} remove={selectedInvestor && selectedContribution ? () => { if (deleteContribution(selectedInvestor, selectedContribution)) { setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); } } : undefined} close={() => { setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); }} save={(contribution) => {
        setData((current) => ({ ...current, investors: current.investors.map((investor) => investor.id === selectedInvestorId ? { ...investor, contributions: investor.contributions.some((item) => item.id === contribution.id) ? investor.contributions.map((item) => item.id === contribution.id ? contribution : item) : [...investor.contributions, contribution] } : investor) }));
        setModal(null); setSelectedInvestorId(""); setSelectedContributionId(""); notify("Aporte guardado");
      }} />}
      <AssistantChat getContext={assistantContext} describe={describeAction} apply={applyAssistantActions} />
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

function SubcategorySelect({ categoryId, value, setValue, categories, subcategories, onNew }: { categoryId: string; value: string; setValue: (value: string) => void; categories: Category[]; subcategories: Subcategory[]; onNew: () => string }) {
  const available = linkedSubcategories(categoryId, categories, subcategories);
  const hasOptions = available.length > 0;
  return <label><span>Subcategoría</span><select required={hasOptions} disabled={!categoryId} value={value} onChange={(event) => { if (event.target.value === "__new") { const id = onNew(); if (id) setValue(id); } else setValue(event.target.value); }}>
    <option value="">{!categoryId ? "Primero elegí una categoría" : hasOptions ? "Elegir…" : "No corresponde"}</option>
    {available.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
    {categoryId && <option value="__new">＋ Crear nueva</option>}
  </select></label>;
}

// Mano de obra / Materiales / Adicionales siempre disponibles, más las subcategorías propias de la categoría.
// Todo lo presupuestado es Mano de obra, Materiales o Adicionales.
const typeOptions = (subcategories: Subcategory[]) => subcategories.filter((item) => !item.archived && defaultSubcategoryIds.has(item.id));

function SubcategoryOptions({ options, value, setValue, error = false }: { options: Subcategory[]; value: string; setValue: (value: string) => void; error?: boolean }) {
  return <div className="field span-2"><span>Tipo</span><div className={`choice-toggle ${error ? "invalid" : ""}`} role="radiogroup" aria-label="Tipo">
    {options.map((item) => <button type="button" role="radio" aria-checked={value === item.id} key={item.id} className={value === item.id ? "active" : ""} onClick={() => setValue(item.id)}>{item.name}</button>)}
  </div>{error && <small className="field-error">Elegí si es mano de obra, materiales o adicionales.</small>}</div>;
}

// Rubro con botones de colores (igual que al registrar un pago).
function RubroPicker({ categories, value, setValue, colorFor, onNew, error = false }: { categories: Category[]; value: string; setValue: (value: string) => void; colorFor: (id: string) => string; onNew: () => string; error?: boolean }) {
  return <div className="field span-2"><span>Rubro</span><div className={`pick-grid rubros ${error ? "invalid" : ""}`} role="radiogroup" aria-label="Rubro">
    {categories.filter((item) => !item.archived).map((item) => <button type="button" role="radio" aria-checked={value === item.id} key={item.id} className={`pick-option ${value === item.id ? "active" : ""}`} onClick={() => setValue(item.id)}><i style={{ background: colorFor(item.id) }} />{item.name}</button>)}
    <button type="button" className="pick-option add" onClick={() => { const id = onNew(); if (id) setValue(id); }}>＋ Nuevo rubro</button>
  </div>{error && <small className="field-error">Elegí un rubro.</small>}</div>;
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

function BudgetItemModal({ data, rate, item, defaultCategoryId, categoryColor, addNamedItem, remove, close, save }: { data: AppState; rate: number; item?: BudgetItem; defaultCategoryId?: string; categoryColor: (id: string) => string; addNamedItem: (kind: "category" | "subcategory") => string; remove: () => void; close: () => void; save: (item: BudgetItem) => void }) {
  const options = typeOptions(data.subcategories);
  const [amount, setAmount] = useState(item?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? "ARS");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(options.some((option) => option.id === item?.subcategoryId) ? item?.subcategoryId ?? "" : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [typeMissing, setTypeMissing] = useState(false);
  const [categoryMissing, setCategoryMissing] = useState(false);
  const selectedRate = item?.rate ?? rate;
  return <Modal title={item ? "Editar presupuesto" : "Agregar al presupuesto"} close={close}><form className="form-grid" onSubmit={(event) => {
    event.preventDefault();
    if (!categoryId) setCategoryMissing(true);
    if (!subcategoryId) setTypeMissing(true);
    if (!categoryId || !subcategoryId || Number(amount) <= 0) return;
    save({ id: item?.id ?? uid("bitem"), categoryId, subcategoryId, description: description.trim(), amount: Number(amount), currency, rate: selectedRate, comparisonId: item?.comparisonId });
  }}>
    <AmountField label="Monto que pensás gastar" currency={currency} setCurrency={setCurrency} amount={amount} setAmount={setAmount} />
    {currency === "USD" && <ConversionHint amount={amount} currency={currency} rate={selectedRate} />}
    <RubroPicker categories={data.categories} value={categoryId} setValue={(value) => { setCategoryId(value); setCategoryMissing(false); }} colorFor={categoryColor} onNew={() => addNamedItem("category")} error={categoryMissing} />
    <SubcategoryOptions options={options} value={subcategoryId} setValue={(value) => { setSubcategoryId(value); setTypeMissing(false); }} error={typeMissing} />
    <label className="span-2"><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: revoque y pintura del living" /></label>
    <FormActions close={close} label={item ? "Guardar cambios" : "Agregar"} deleteLabel={item ? "Eliminar" : undefined} onDelete={remove} />
  </form></Modal>;
}

function InlinePaymentForm({ expense, rateFor, remaining, payments, removePayment, edit, remove, save }: { expense: Payable; rateFor: (date: string) => number; remaining: number; payments: Payment[]; removePayment: (payment: Payment) => void; edit?: () => void; remove?: () => void; save: (payment: Payment) => void }) {
  const [partial, setPartial] = useState(false);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(expense.currency);
  const rate = rateFor(date);
  const todayRate = rateFor(today());
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
  const payFull = () => save({ id: uid("pay"), expenseId: expense.id, date: today(), description: "", amount: remaining, currency: expense.currency, rate: todayRate });
  const details = [
    expense.responsible && ["Responsable", expense.responsible],
  ].filter(Boolean) as string[][];

  return <div className="inline-payment-panel">
    {edit && remove && <div className="expense-detail-head">
      <dl className="expense-detail-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="expense-detail-actions"><button type="button" className="mini-button" onClick={edit}>Editar</button><button type="button" className="danger-button compact" onClick={remove}>Eliminar</button></div>
    </div>}
    {payments.length > 0 && <div className="expense-payments">
      <span>Pagos realizados</span>
      {payments.slice().sort((a, b) => a.date.localeCompare(b.date)).map((payment) => <div key={payment.id}>
        <small>{shortDate(payment.date)}{payment.description ? ` · ${payment.description}` : ""}</small>
        <b>{money(payment.amount, payment.currency)}{payment.currency === "ARS" && <small className="usd-note">US$ {usdPlain(payment.amount / payment.rate)} · dólar {money(payment.rate, "ARS")}</small>}</b>
        <button type="button" className="link-danger" onClick={() => removePayment(payment)}>Eliminar</button>
      </div>)}
    </div>}
    {remaining <= 0.005 ? <div className="inline-payment-complete">✓ Esto ya está pagado.</div> : !partial ? <div className="full-payment-choice">
      <div><span>Falta pagar</span><b>{money(remaining, expense.currency)}</b>{expense.currency === "ARS" && <small>Pagado hoy son US$ {usdPlain(remaining / todayRate)} (dólar {money(todayRate, "ARS")})</small>}</div>
      <button type="button" className="secondary-button" onClick={() => setPartial(true)}>Pagar una parte</button>
      <button type="button" className="primary-button" onClick={payFull}>Pagar todo</button>
    </div> : <form className="form-grid inline-payment-form" onSubmit={submit}>
      <AmountField label="Monto pagado" currency={currency} setCurrency={(value) => { setCurrency(value); setAmount(""); }} amount={amount} setAmount={setAmount} invalid={tooMuch} />
      {amount && Number(amount) > 0 && <p className={`conversion-hint span-2 ${tooMuch ? "error" : ""}`}>{tooMuch ? <>Supera lo que falta pagar. Máximo: <b>{money(maxAmount, currency)}</b></> : <>Se descuentan {money(debitAmount, expense.currency)} del saldo.{currency === "ARS" && <> Se pasa a <b>US$ {usdPlain(Number(amount) / rate)}</b> con el dólar del {date === today() ? "día de hoy" : shortDate(date)} ({money(rate, "ARS")}).</>}</>}</p>}
      <label><span>Fecha del pago</span><DateInput required value={date} setValue={setDate} /></label>
      <label><span>Nota (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: transferencia" /></label>
      <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setPartial(false)}>Cancelar</button><button className="primary-button" type="submit">Guardar pago</button></div>
    </form>}
  </div>;
}

// Registrar un pago en pasos: rubro → qué se pagó (agrupado por tipo) → cuánto.
function PaymentModal({ lines, rateFor, initialLineId, remainingFor, categoryName, subcategoryName, categoryColor, close, save }: { lines: BudgetItem[]; rateFor: (date: string) => number; initialLineId: string; remainingFor: (line: Payable) => number; categoryName: (id: string) => string; subcategoryName: (id: string) => string; categoryColor: (id: string) => string; close: () => void; save: (payment: Payment) => void }) {
  const pending = lines.filter((item) => remainingFor(item) > 0.005);
  const initialLine = pending.find((item) => item.id === initialLineId);
  const [categoryId, setCategoryId] = useState(initialLine?.categoryId ?? "");
  const [lineId, setLineId] = useState(initialLine?.id ?? "");
  const line = pending.find((item) => item.id === lineId);
  const categoryIds = [...new Set(pending.map((item) => item.categoryId))].sort((a, b) => categoryName(a).localeCompare(categoryName(b), "es"));
  const inCategory = pending.filter((item) => item.categoryId === categoryId);
  const typeOrder = (id: string) => { const index = ["sub-mano-obra", "sub-materiales", "sub-adicionales"].indexOf(id); return index < 0 ? 99 : index; };
  const typeIds = [...new Set(inCategory.map((item) => item.subcategoryId))].sort((a, b) => typeOrder(a) - typeOrder(b));
  const lineLabel = (item: BudgetItem) => item.description || subcategoryName(item.subcategoryId) || "Sin descripción";

  return <Modal title="Registrar pago" close={close}><div className="form-grid">
    {!categoryId && <div className="field span-2"><span>¿De qué rubro es el pago?</span><div className="pick-grid">
      {categoryIds.map((id) => <button type="button" key={id} className="pick-option" onClick={() => setCategoryId(id)}><i style={{ background: categoryColor(id) }} />{categoryName(id)}</button>)}
    </div></div>}

    {categoryId && !line && <div className="field span-2">
      <button type="button" className="text-button pick-back" onClick={() => setCategoryId("")}>← {categoryName(categoryId)} · cambiar rubro</button>
      <span>¿Qué pagaste?</span>
      {typeIds.map((typeId) => <div className="pick-group" key={typeId || "none"}>
        <small>{subcategoryName(typeId) || "Sin tipo"}</small>
        {inCategory.filter((item) => item.subcategoryId === typeId).map((item) => <button type="button" key={item.id} className="pick-option line" onClick={() => setLineId(item.id)}>{lineLabel(item)}</button>)}
      </div>)}
    </div>}

    {line && <>
      <div className="pick-selected span-2">
        <span><i style={{ background: categoryColor(line.categoryId) }} /><b>{categoryName(line.categoryId)}</b> · {subcategoryName(line.subcategoryId)}{line.description ? ` · ${line.description}` : ""}</span>
        <button type="button" className="text-button" onClick={() => setLineId("")}>Cambiar</button>
      </div>
      <div className="span-2"><InlinePaymentForm key={line.id} expense={line} rateFor={rateFor} remaining={remainingFor(line)} payments={[]} removePayment={() => undefined} save={save} /></div>
    </>}
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

function BudgetModal({ categories, subcategories, categoryColor, addNamedItem, close, save }: { categories: Category[]; subcategories: Subcategory[]; categoryColor: (id: string) => string; addNamedItem: (kind: "category" | "subcategory") => string; close: () => void; save: (group: BudgetGroup) => void }) {
  const [name, setName] = useState(""); const [categoryId, setCategoryId] = useState(""); const [subcategoryId, setSubcategoryId] = useState("");
  const [typeMissing, setTypeMissing] = useState(false);
  const [categoryMissing, setCategoryMissing] = useState(false);
  return <Modal title="Nueva comparación" close={close}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!categoryId) setCategoryMissing(true); if (!subcategoryId) setTypeMissing(true); if (!categoryId || !subcategoryId) return; save({ id: uid("budget"), name: name.trim(), categoryId, subcategoryId, offers: [] }); }}>
    <label className="span-2"><span>¿Qué querés comparar?</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: sanitarios para el baño" /></label>
    <RubroPicker categories={categories} value={categoryId} setValue={(value) => { setCategoryId(value); setCategoryMissing(false); }} colorFor={categoryColor} onNew={() => addNamedItem("category")} error={categoryMissing} />
    <SubcategoryOptions options={typeOptions(subcategories)} value={subcategoryId} setValue={(value) => { setSubcategoryId(value); setTypeMissing(false); }} error={typeMissing} />
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
    {currency === "USD" && <ConversionHint amount={amount} currency={currency} rate={rate} />}
    <MoreOptions open={showMore} setOpen={setShowMore} summary={`Fecha: ${date === today() ? "hoy" : shortDate(date)} · Descripción`}>
      <label><span>Fecha</span><DateInput required value={date} setValue={setDate} /></label>
      <label><span>Descripción (opcional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle breve" /></label>
    </MoreOptions>
    <FormActions close={close} label="Guardar oferta" />
  </form></Modal>;
}

function InvestmentPlanModal({ field, plan, close, save }: { field: PlanField; plan: InvestmentPlan; close: () => void; save: (plan: InvestmentPlan) => void }) {
  const [propertyValue, setPropertyValue] = useState(plan.propertyValueUsd ? plan.propertyValueUsd.toString() : "");
  const [propertyCommissionPercent, setPropertyCommissionPercent] = useState(plan.propertyCommissionPercent.toString());
  const [ownMoney, setOwnMoney] = useState(plan.ownCapitalUsd ? plan.ownCapitalUsd.toString() : "");
  const [remodelBudget, setRemodelBudget] = useState(plan.remodelBudgetUsd ? plan.remodelBudgetUsd.toString() : "");
  const [salePrice, setSalePrice] = useState(plan.projectedSalePriceUsd ? plan.projectedSalePriceUsd.toString() : "");
  const [purchaseDate, setPurchaseDate] = useState(plan.purchaseDate);
  const [saleDate, setSaleDate] = useState(plan.projectedSaleDate);
  const commissionPercent = Math.max(0, Number(propertyCommissionPercent) || 0);
  const propertyTotal = propertyCostWithCommission(Number(propertyValue) || 0, commissionPercent);
  const titles: Record<PlanField, string> = { property: "Valor de la propiedad", remodel: "Remodelación proyectada", sale: "Venta proyectada", own: "Plata propia" };
  return <Modal title={titles[field]} close={close}><form className="form-grid" onSubmit={(event) => {
    event.preventDefault();
    save({ ...plan, propertyValueUsd: Number(propertyValue) || 0, propertyCommissionPercent: commissionPercent, ownCapitalUsd: Number(ownMoney) || 0, ownCapitalManual: true, remodelBudgetUsd: Number(remodelBudget) || 0, projectedSalePriceUsd: Number(salePrice) || 0, purchaseDate, projectedSaleDate: saleDate });
  }}>
    {field === "property" && <>
      <label className="span-2"><span>Valor de la propiedad (US$, sin comisiones)</span><FormattedAmountInput value={propertyValue} setValue={setPropertyValue} placeholder="US$" /></label>
      <label><span>Comisiones (%)</span><input type="number" min="0" step="0.1" value={propertyCommissionPercent} onChange={(event) => setPropertyCommissionPercent(event.target.value)} /></label>
      <label><span>Fecha de compra</span><DateInput value={purchaseDate} setValue={setPurchaseDate} /></label>
      <p className="conversion-hint span-2">Precio total con comisiones: <b>{money(propertyTotal, "USD")}</b></p>
    </>}
    {field === "remodel" && <label className="span-2"><span>Cuánto estimás gastar en la remodelación (US$)</span><FormattedAmountInput value={remodelBudget} setValue={setRemodelBudget} placeholder="US$" /></label>}
    {field === "sale" && <><label><span>Precio de venta estimado (US$)</span><FormattedAmountInput value={salePrice} setValue={setSalePrice} placeholder="US$" /></label><label><span>Fecha estimada de venta</span><DateInput value={saleDate} setValue={setSaleDate} /></label></>}
    {field === "own" && <label className="span-2"><span>Cuánta plata propia pusiste (US$)</span><FormattedAmountInput value={ownMoney} setValue={setOwnMoney} placeholder="US$" /></label>}
    <FormActions close={close} label="Guardar" />
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
  const [showMore, setShowMore] = useState(false);
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
    {!investor && <AmountField label="Cuánto invirtió" currency={firstCurrency} setCurrency={setFirstCurrency} amount={firstAmount} setAmount={setFirstAmount} />}
    <AmountField label="Ganancia que le vas a dar" currency={profitCurrency} setCurrency={setProfitCurrency} amount={profit} setAmount={setProfit} />
    <p className="conversion-hint span-2">Al final se le devuelve lo que invirtió más esta ganancia.{profitCurrency === "ARS" && profit ? ` Equivale a ${money(Number(profit) / profitConversionRate, "USD")}.` : ""}</p>
    {!investor && <MoreOptions open={showMore} setOpen={setShowMore} summary={`Fecha en que invirtió: ${firstDate === today() ? "hoy" : shortDate(firstDate)}`}>
      <label className="span-2"><span>Fecha en que invirtió</span><DateInput required value={firstDate} setValue={setFirstDate} /></label>
    </MoreOptions>}
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
