const BCRA_URL = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD";

export async function GET() {
  try {
    const response = await fetch(BCRA_URL, {
      headers: { "Accept-Language": "es-AR" },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);

    if (!response.ok) throw new Error("El BCRA no respondió.");
    const payload = (await response.json()) as {
      results?: Array<{ fecha: string; detalle?: Array<{ codigoMoneda: string; tipoCotizacion: number }> }>;
    };
    const official = payload.results?.[0];
    const quote = official?.detalle?.find((item) => item.codigoMoneda === "USD")?.tipoCotizacion;
    if (!official || !quote) throw new Error("No se encontró la cotización oficial.");

    return Response.json({
      rate: Number(quote),
      date: official.fecha,
      source: "BCRA · dólar oficial",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar la cotización." },
      { status: 502 },
    );
  }
}
