const AMBITO_URL = "https://mercados.ambito.com/dolar/oficial/historico-general";

type AmbitoRow = [string, string, string];

const dayMonthYear = (date: Date) => [String(date.getUTCDate()).padStart(2, "0"), String(date.getUTCMonth() + 1).padStart(2, "0"), date.getUTCFullYear()].join("-");
const toNumber = (value: string) => Number(value.replaceAll(".", "").replace(",", "."));

export async function GET() {
  try {
    const today = new Date();
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 7));
    const response = await fetch(`${AMBITO_URL}/${dayMonthYear(from)}/${dayMonthYear(today)}`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);

    if (!response.ok) throw new Error("No se pudo consultar la cotización oficial.");
    const rows = (await response.json()) as [string[], ...AmbitoRow[]];
    const latest = rows.slice(1).find((item) => Number.isFinite(toNumber(item[1])) && Number.isFinite(toNumber(item[2])));
    if (!latest) throw new Error("No se encontró una cotización oficial vigente.");
    const buy = toNumber(latest[1]);
    const sell = toNumber(latest[2]);
    const [day, month, year] = latest[0].split("/");

    return Response.json({
      rate: (buy + sell) / 2,
      date: `${year}-${month}-${day}`,
      source: "Dólar oficial · promedio compra/venta",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar la cotización." },
      { status: 502 },
    );
  }
}
