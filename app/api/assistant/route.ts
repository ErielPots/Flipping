import { env } from "cloudflare:workers";

// Asistente de carga: entiende lo que escribe el usuario y propone acciones
// (la app las muestra y las aplica solo si el usuario confirma).
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

type ChatMessage = { role: "user" | "assistant"; content: string };

const ACTION_TYPES = [
  "agregar_presupuesto",
  "registrar_pago",
  "actualizar_propiedad",
  "actualizar_venta",
  "actualizar_remodelacion",
  "actualizar_plata_propia",
  "agregar_inversor",
];

const responderTool = {
  type: "function",
  function: {
    name: "responder",
    description: "Responde al usuario y, si corresponde, propone acciones para cargar en la app. Si falta un dato necesario, no propongas acciones: preguntalo en el mensaje.",
    parameters: {
      type: "object",
      properties: {
        mensaje: { type: "string", description: "Respuesta breve en español rioplatense para mostrarle al usuario." },
        acciones: {
          type: "array",
          description: "Acciones a proponer. Puede estar vacía.",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ACTION_TYPES },
              rubro: { type: "string", description: "Nombre del rubro/categoría (agregar_presupuesto). Usá uno existente si coincide." },
              tipo_gasto: { type: "string", enum: ["mano_de_obra", "materiales", "adicionales"], description: "Obligatorio en agregar_presupuesto." },
              descripcion: { type: "string" },
              monto: { type: "number", description: "Monto numérico sin separadores. En registrar_pago, omitilo para pagar todo lo que falta." },
              moneda: { type: "string", enum: ["ARS", "USD"] },
              linea_id: { type: "string", description: "id exacto de la línea del presupuesto (registrar_pago). Elegilo de la lista del contexto." },
              fecha: { type: "string", description: "Fecha en formato AAAA-MM-DD." },
              nota: { type: "string" },
              comisiones_pct: { type: "number", description: "Porcentaje de comisiones de la compra (actualizar_propiedad)." },
              nombre: { type: "string", description: "Nombre del inversor (agregar_inversor)." },
              ganancia: { type: "number", description: "Ganancia acordada para el inversor (agregar_inversor)." },
              moneda_ganancia: { type: "string", enum: ["ARS", "USD"] },
            },
            required: ["tipo"],
          },
        },
      },
      required: ["mensaje", "acciones"],
    },
  },
};

const systemPrompt = (context: unknown, recentActions: unknown) => `Sos el asistente de "Control de Obra", una app para seguir la remodelación de una casa (Argentina).
Tu trabajo es entender lo que pide el usuario y proponer acciones con la herramienta "responder". La app le pide confirmación antes de guardar, así que proponé las acciones directamente cuando tengas los datos.

Reglas del mensaje:
- Respondé siempre con la herramienta "responder", en español rioplatense, cálido y muy breve.
- Cuando propongas acciones, el mensaje es UNA frase corta y amable (máximo 8 palabras) que NO repite montos, rubros, tipos ni fechas: la app ya muestra el detalle en una tarjeta debajo. Ejemplos: "¡Perfecto! Revisalo y confirmá.", "Dale, ¿lo cargo?", "Anotado, confirmá abajo.", "¡Buenísimo! ¿Lo guardo?". Variá las frases y no empieces con "Listo" (suena a que ya se guardó).
- Nada se guarda hasta que el usuario toca "Confirmar": nunca digas que algo "se registró" o "se cargó". No menciones ids internos ni la palabra "línea".
- Si tenés que preguntar algo, hacé una sola pregunta concreta y ofrecé las opciones (por ejemplo: "¿Es para Sanitarios del baño (faltan $ 1.300.000) o para Instalación baño y cocina (faltan $ 1.400.000)?").
- Si el usuario pregunta algo (cuánto lleva pagado, cuánto falta, cuánto presupuestó), contestalo con los datos y totales del contexto, sin proponer acciones. Escribí los montos como en Argentina: $ 1.500.000 o US$ 90.000.

Reglas de las acciones:
- En "descripcion" poné lo útil que diga el usuario: quién pasó el presupuesto o a quién se pagó y qué es (por ejemplo "Presupuesto de Juancito"). Si no dice nada, dejala vacía.
- Montos: "300 lucas" o "300 mil" = 300000; "1 palo" o "un millón" = 1000000; "1,5 M" = 1500000. Usá números sin puntos.
- Moneda por defecto: pesos (ARS) para presupuesto y pagos; dólares (USD) para propiedad, venta, remodelación proyectada, plata propia e inversores. Si el usuario dice "dólares", "USD" o "verdes", usá USD.
- Fechas: si el usuario menciona un día ("ayer", "el lunes", "el 15"), SIEMPRE completá "fecha" en AAAA-MM-DD calculándola desde los campos "hoy", "dia_de_la_semana" y "ayer" del contexto. Si no menciona ningún día, dejá "fecha" vacía (se usa hoy).
- agregar_presupuesto necesita rubro, tipo_gasto (mano_de_obra, materiales o adicionales) y monto. Si no queda claro el tipo, preguntá.
- registrar_pago necesita linea_id de una línea del presupuesto con "con_saldo": true. NUNCA elijas una que ya está pagada (con_saldo: false). Buscá entre las líneas con saldo del rubro que nombra el usuario (y del tipo, si lo dice): si hay una sola, usala aunque no diga el tipo; si hay varias, preguntá cuál listándolas una por renglón con su "nombre" y lo que falta (nunca muestres el id); si no hay ninguna, avisale que ese rubro no tiene nada pendiente. Si no dice monto, se paga todo lo que falta (no mandes monto).
- actualizar_propiedad: monto = valor de la propiedad en USD sin comisiones; comisiones_pct y fecha (de compra) opcionales.
- actualizar_venta: monto = precio de venta estimado en USD; fecha estimada opcional.
- actualizar_remodelacion: monto = lo que se estima gastar en la remodelación, en USD.
- actualizar_plata_propia: monto = plata propia puesta, en USD.
- agregar_inversor: nombre, monto invertido, ganancia acordada (monto, no porcentaje) y fecha opcional.
- No inventes ids ni datos. Si algo no se puede hacer con estas acciones, decilo.

Contexto actual de la app (JSON):
${JSON.stringify(context)}

Acciones que propusiste hace poco y qué pasó con cada una (no vuelvas a proponer las que ya se cargaron):
${JSON.stringify(recentActions ?? [])}`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Llama a Groq; si se pasa del límite por minuto, espera lo que pide (hasta 10 s) y reintenta una vez.
async function callGroq(apiKey: string, body: Record<string, unknown>, retry = true): Promise<Response> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (response.status === 429 && retry) {
    const detail = await response.text();
    const seconds = Number(/try again in ([\d.]+)s/.exec(detail)?.[1] ?? "5");
    await wait(Math.min(10, Math.max(1, seconds)) * 1000);
    return callGroq(apiKey, body, false);
  }
  return response;
}

export async function POST(request: Request) {
  const apiKey = (env as unknown as { GROQ_API_KEY?: string }).GROQ_API_KEY;
  const model = (env as unknown as { GROQ_MODEL?: string }).GROQ_MODEL || DEFAULT_MODEL;
  if (!apiKey) {
    return Response.json({ error: "Falta configurar la clave GROQ_API_KEY en el servidor." }, { status: 500 });
  }

  try {
    const { messages, context, recentActions } = (await request.json()) as { messages?: ChatMessage[]; context?: unknown; recentActions?: unknown };
    const history = (messages ?? [])
      .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      .slice(-12);
    if (!history.length) return Response.json({ error: "No hay mensaje." }, { status: 400 });

    const body = {
      model,
      temperature: 0,
      messages: [{ role: "system", content: systemPrompt(context, recentActions) }, ...history],
      tools: [responderTool],
      tool_choice: { type: "function", function: { name: "responder" } },
    };
    let response = await callGroq(apiKey, body);
    // Si el modelo contestó sin usar la herramienta, reintenta una vez dejándolo elegir.
    if (response.status === 400 && (await response.clone().text()).includes("tool_use_failed")) {
      response = await callGroq(apiKey, { ...body, tool_choice: "auto" });
    }
    if (response.status === 429) {
      return Response.json({ error: "El asistente está con mucho uso en este momento. Probá de nuevo en unos segundos." }, { status: 429 });
    }
    if (!response.ok) {
      const detail = await response.text();
      return Response.json({ error: `Groq respondió ${response.status}.`, detail: detail.slice(0, 500) }, { status: 502 });
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const message = result.choices?.[0]?.message;
    const rawArguments = message?.tool_calls?.[0]?.function?.arguments;
    if (!rawArguments) return Response.json({ reply: message?.content || "No te entendí, ¿me lo decís de otra forma?", actions: [] });

    const parsed = JSON.parse(rawArguments) as { mensaje?: string; acciones?: Array<{ tipo?: string }> };
    const actions = (parsed.acciones ?? []).filter((action) => action && ACTION_TYPES.includes(action.tipo ?? ""));
    return Response.json({ reply: parsed.mensaje ?? "", actions });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar al asistente." },
      { status: 500 },
    );
  }
}
