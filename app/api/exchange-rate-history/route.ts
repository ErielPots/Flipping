const AMBITO_URL = "https://mercados.ambito.com/dolar/oficial/historico-general";

type AmbitoRow = [string, string, string];

const dayMonthYear = (date: Date) => [String(date.getUTCDate()).padStart(2, "0"), String(date.getUTCMonth() + 1).padStart(2, "0"), date.getUTCFullYear()].join("-");
const toNumber = (value: string) => Number(value.replaceAll(".", "").replace(",", "."));

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
    const history = rows.slice(1).flatMap((item) => {
      const buy = toNumber(item[1]);
      const sell = toNumber(item[2]);
      const [day, month, year] = item[0].split("/");
      const date = `${year}-${month}-${day}`;
      if (dates.has(date) || !Number.isFinite(buy) || !Number.isFinite(sell)) return [];
      dates.add(date);
      return [{ date, rate: (buy + sell) / 2, source: "Dólar oficial · promedio compra/venta" }];
    });
    return Response.json({ history });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo descargar el historial." }, { status: 502 });
  }
}
