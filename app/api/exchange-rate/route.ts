const BCRA_URL = "https://api.bcra.gob.ar/estadisticas/v2.0/principalesvariables";

export async function GET() {
  try {
    const response = await fetch(BCRA_URL, {
      headers: { "Accept-Language": "es-AR" },
      cf: { cacheTtl: 1800, cacheEverything: true },
    } as RequestInit);

    if (!response.ok) throw new Error("El BCRA no respondió.");
    const payload = (await response.json()) as {
      results?: Array<{ idVariable: number; descripcion: string; fecha: string; valor: number }>;
    };
    const official = payload.results?.find((item) => item.idVariable === 4);
    if (!official) throw new Error("No se encontró la cotización oficial.");

    return Response.json({
      rate: Number(official.valor),
      date: official.fecha,
      source: "BCRA · promedio vendedor",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar la cotización." },
      { status: 502 },
    );
  }
}
