const AMBITO_URL = "https://mercados.ambito.com/dolar/oficial/historico-general";

type AmbitoRow = [string, string, string];

const dayMonthYear = (date: Date) => [String(date.getUTCDate()).padStart(2, "0"), String(date.getUTCMonth() + 1).padStart(2, "0"), date.getUTCFullYear()].join("-");
const toNumber = (value: string) => Number(value.replaceAll(".", "").replace(",", "."));
const weekStart = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
};

export async function GET() {
  try {
    const today = new Date();
    const firstDay = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const response = await fetch(`${AMBITO_URL}/${dayMonthYear(firstDay)}/${dayMonthYear(today)}`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) throw new Error("No se pudo descargar el historial de cotizaciones.");

    const rows = (await response.json()) as [string[], ...AmbitoRow[]];
    const dates = new Set<string>();
    const dailyHistory = rows.slice(1).flatMap((item) => {
      const buy = toNumber(item[1]);
      const sell = toNumber(item[2]);
      const [day, month, year] = item[0].split("/");
      const date = `${year}-${month}-${day}`;
      if (dates.has(date) || !Number.isFinite(buy) || !Number.isFinite(sell)) return [];
      dates.add(date);
      return [{ date, rate: (buy + sell) / 2, source: "Dólar oficial · promedio compra/venta" }];
    });
    const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 30)).toISOString().slice(0, 10);
    const weekly = new Map<string, { total: number; count: number }>();
    const recent = dailyHistory.filter((item) => item.date >= cutoff);
    for (const item of dailyHistory.filter((entry) => entry.date < cutoff)) {
      const week = weekStart(item.date);
      const current = weekly.get(week) ?? { total: 0, count: 0 };
      weekly.set(week, { total: current.total + item.rate, count: current.count + 1 });
    }
    const history = [
      ...recent,
      ...[...weekly.entries()].map(([date, values]) => ({ date, rate: values.total / values.count, source: "Dólar oficial · promedio semanal compra/venta" })),
    ].sort((left, right) => right.date.localeCompare(left.date));
    return Response.json({ history });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo descargar el historial." }, { status: 502 });
  }
}
