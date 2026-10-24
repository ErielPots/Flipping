import { env } from "cloudflare:workers";

// Pasa un audio grabado en el celular a texto con Whisper (Groq).
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function POST(request: Request) {
  const apiKey = (env as unknown as { GROQ_API_KEY?: string }).GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Falta configurar la clave GROQ_API_KEY en el servidor." }, { status: 500 });
  }

  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No llegó el audio." }, { status: 400 });
    if (audio.size > 24 * 1024 * 1024) return Response.json({ error: "El audio es demasiado largo." }, { status: 413 });

    const transcribe = (model: string) => {
      const form = new FormData();
      form.append("file", audio, audio instanceof File && audio.name ? audio.name : "audio.webm");
      form.append("model", model);
      form.append("language", "es");
      form.append("response_format", "json");
      return fetch(GROQ_TRANSCRIBE_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    };

    // Si el modelo rápido está bloqueado en la cuenta de Groq, prueba con el otro Whisper.
    let response = await transcribe("whisper-large-v3-turbo");
    if (response.status === 403) response = await transcribe("whisper-large-v3");
    if (!response.ok) {
      const detail = await response.text();
      const blocked = detail.includes("model_permission_blocked");
      return Response.json({
        error: blocked ? "El modelo de audio está bloqueado en la cuenta de Groq. Hay que habilitarlo en console.groq.com → Settings → Limits." : `Groq respondió ${response.status}.`,
        detail: detail.slice(0, 500),
      }, { status: 502 });
    }
    const result = (await response.json()) as { text?: string };
    return Response.json({ text: (result.text ?? "").trim() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo pasar el audio a texto." },
      { status: 500 },
    );
  }
}
