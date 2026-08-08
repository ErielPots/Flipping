import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appState } from "../../../db/schema";

const INITIAL_STATE = {
  catalogVersion: 2,
  categories: [
    { id: "cat-contratista", name: "Contratista", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales", "sub-adicionales"] },
    { id: "cat-electricista", name: "Electricista", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
    { id: "cat-plomeria", name: "Plomería", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
    { id: "cat-pintor", name: "Pintor", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
    { id: "cat-colocador-pisos", name: "Colocador de pisos", archived: false, subcategoryIds: ["sub-mano-obra", "sub-materiales"] },
    { id: "cat-zinguero", name: "Zinguero", archived: false, subcategoryIds: [] },
    { id: "cat-muebles-cocina", name: "Muebles de cocina", archived: false, subcategoryIds: [] },
    { id: "cat-placares", name: "Placares", archived: false, subcategoryIds: [] },
    { id: "cat-ventanas", name: "Ventanas", archived: false, subcategoryIds: [] },
  ],
  subcategories: [
    { id: "sub-mano-obra", name: "Mano de obra", archived: false },
    { id: "sub-materiales", name: "Materiales", archived: false },
    { id: "sub-adicionales", name: "Adicionales", archived: false },
  ],
  expenses: [],
  payments: [],
  progress: [],
  budgetGroups: [],
};

async function ensureStateTable() {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

export async function GET() {
  try {
    await ensureStateTable();
    const db = getDb();
    const row = await db.select().from(appState).where(eq(appState.id, 1)).get();

    if (!row) {
      await db.insert(appState).values({ id: 1, payload: JSON.stringify(INITIAL_STATE) });
      return Response.json({ state: INITIAL_STATE });
    }

    return Response.json({ state: JSON.parse(row.payload), updatedAt: row.updatedAt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los datos." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await ensureStateTable();
    const payload = await request.json();
    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const db = getDb();
    await db
      .insert(appState)
      .values({ id: 1, payload: JSON.stringify(payload) })
      .onConflictDoUpdate({
        target: appState.id,
        set: { payload: JSON.stringify(payload), updatedAt: new Date().toISOString() },
      });

    return Response.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudieron guardar los datos." },
      { status: 500 },
    );
  }
}
