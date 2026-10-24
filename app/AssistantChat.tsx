"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

export type AssistantAction = {
  tipo: string;
  rubro?: string;
  tipo_gasto?: "mano_de_obra" | "materiales" | "adicionales";
  descripcion?: string;
  monto?: number;
  moneda?: "ARS" | "USD";
  linea_id?: string;
  fecha?: string;
  nota?: string;
  comisiones_pct?: number;
  nombre?: string;
  ganancia?: number;
  moneda_ganancia?: "ARS" | "USD";
};
export type ActionPreview = { text: string; problem?: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
  actionState?: "pending" | "done" | "cancelled";
  error?: boolean;
};

const messageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const audioExtension = (mimeType: string) => mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";

// Chat para cargar datos escribiendo o con un audio. El servidor (Groq) propone acciones
// y la app las aplica solo cuando el usuario toca "Confirmar".
export function AssistantChat({ getContext, describe, apply }: {
  getContext: () => unknown;
  describe: (action: AssistantAction) => ActionPreview;
  apply: (actions: AssistantAction[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  // Al modelo solo le llega lo que vino después de la última propuesta confirmada o cancelada
  // (si no, vuelve a proponer lo que ya se cargó). Los errores no se mandan, y el estado de las
  // acciones va aparte (si va en el texto, el modelo lo imita).
  const historyForModel = (items: ChatMessage[]) => {
    const lastSettled = items.map((message) => message.actionState === "done" || message.actionState === "cancelled").lastIndexOf(true);
    return items.slice(lastSettled + 1).filter((message) => !message.error).map((message) => ({ role: message.role, content: message.content }));
  };
  const recentActions = (items: ChatMessage[]) => items.filter((message) => message.actions?.length).slice(-5).flatMap((message) => (message.actions ?? []).map((action) => ({
    accion: describe(action).text,
    estado: message.actionState === "done" ? "confirmada y cargada" : message.actionState === "cancelled" ? "cancelada" : "esperando confirmación",
  })));

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history = [...messages, { id: messageId(), role: "user" as const, content: trimmed }];
    setMessages(history);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForModel(history), context: getContext(), recentActions: recentActions(history) }),
      });
      const result = (await response.json()) as { reply?: string; actions?: AssistantAction[]; error?: string };
      if (!response.ok) throw new Error(result.error || "El asistente no respondió.");
      const actions = result.actions ?? [];
      setMessages((current) => [...current, {
        id: messageId(),
        role: "assistant",
        content: result.reply || (actions.length ? "Esto es lo que entendí:" : "No te entendí, ¿me lo decís de otra forma?"),
        actions: actions.length ? actions : undefined,
        actionState: actions.length ? "pending" : undefined,
      }]);
    } catch (error) {
      setMessages((current) => [...current, { id: messageId(), role: "assistant", content: error instanceof Error ? error.message : "No pude responder.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const transcribeAndSend = async (audio: Blob) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("audio", audio, `audio.${audioExtension(audio.type)}`);
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo pasar el audio a texto.");
      setBusy(false);
      if (result.text) await send(result.text);
      else setMessages((current) => [...current, { id: messageId(), role: "assistant", content: "No se escuchó nada en el audio.", error: true }]);
    } catch (error) {
      setMessages((current) => [...current, { id: messageId(), role: "assistant", content: error instanceof Error ? error.message : "No se pudo pasar el audio a texto.", error: true }]);
      setBusy(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        void transcribeAndSend(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setMessages((current) => [...current, { id: messageId(), role: "assistant", content: "No pude usar el micrófono. Revisá que el navegador tenga permiso.", error: true }]);
    }
  };

  const settle = (id: string, state: "done" | "cancelled") => {
    const message = messages.find((item) => item.id === id);
    if (!message?.actions || message.actionState !== "pending") return;
    if (state === "done") apply(message.actions.filter((action) => !describe(action).problem));
    setMessages((current) => current.map((item) => item.id === id ? { ...item, actionState: state } : item));
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
  };

  if (!open) return <button type="button" className="assistant-fab" onClick={() => setOpen(true)} aria-label="Abrir asistente">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
    <span>Asistente</span>
  </button>;

  return <section className="assistant-panel" role="dialog" aria-label="Asistente">
    <header className="assistant-head">
      <div><b>Asistente</b><small>Escribí o mandá un audio</small></div>
      <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Cerrar asistente">×</button>
    </header>
    <div className="assistant-messages" ref={listRef}>
      {messages.length === 0 && <div className="assistant-intro">
        <p>Contame qué querés cargar. Por ejemplo:</p>
        {["Pagué 300 mil al electricista", "Agregá 2 millones de materiales para el contratista", "La venta la estimo en 125 mil dólares"].map((example) => <button type="button" key={example} onClick={() => void send(example)}>{example}</button>)}
      </div>}
      {messages.map((message) => <div key={message.id} className={`assistant-message ${message.role} ${message.error ? "error" : ""}`}>
        <p>{message.content}</p>
        {message.actions && <div className="assistant-actions">
          <ul>{message.actions.map((action, index) => {
            const preview = describe(action);
            return <li key={index} className={preview.problem ? "problem" : ""}>{preview.text}{preview.problem && <small>{preview.problem}</small>}</li>;
          })}</ul>
          {message.actionState === "pending" ? <div className="assistant-action-buttons">
            <button type="button" className="secondary-button" onClick={() => settle(message.id, "cancelled")}>Cancelar</button>
            <button type="button" className="primary-button" disabled={message.actions.every((action) => describe(action).problem)} onClick={() => settle(message.id, "done")}>Confirmar</button>
          </div> : <small className={`assistant-state ${message.actionState}`}>{message.actionState === "done" ? "✓ Cargado" : "Cancelado"}</small>}
        </div>}
      </div>)}
      {busy && <div className="assistant-message assistant typing"><p>Pensando…</p></div>}
    </div>
    <form className="assistant-input" onSubmit={submit}>
      <textarea rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder={recording ? "Grabando… tocá ■ para enviar" : "Escribí acá…"} disabled={recording} aria-label="Mensaje para el asistente" />
      <button type="button" className={`assistant-mic ${recording ? "recording" : ""}`} onClick={() => recording ? recorderRef.current?.stop() : void startRecording()} disabled={busy && !recording} aria-label={recording ? "Detener y enviar audio" : "Grabar audio"}>
        {recording ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>}
      </button>
      <button type="submit" className="primary-button assistant-send" disabled={busy || recording || !input.trim()}>Enviar</button>
    </form>
  </section>;
}
