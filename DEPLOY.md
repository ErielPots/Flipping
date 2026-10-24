# Publicar Control de Obra en Cloudflare

El repo ya queda conectado a Cloudflare D1. Falta completar dos datos de tu base y correr el deploy.

## 1. Completar `cloudflare.json`

```json
{
  "workerName": "control-de-obra",
  "d1": {
    "databaseName": "el-nombre-que-le-pusiste",
    "databaseId": "el-uuid-de-tu-base"
  }
}
```

Los dos datos están en el panel de Cloudflare, en **Storage & Databases → D1**, entrando a tu base.
El `databaseId` es un UUID tipo `3f1c9a0e-5b2d-4c77-9a11-8e6f0d2b4c58`. No es secreto: va commiteado.

`workerName` define la dirección final: `control-de-obra.<tu-subdominio>.workers.dev`.

## 2. Entrar a tu cuenta de Cloudflare

```bash
npx wrangler login
```

Abre el navegador y te pide autorizar. Se hace una sola vez por máquina.

## 3. Publicar

```bash
npm install
npm run deploy
```

Al terminar imprime la URL. Ese es el link para compartir.

## 4. El asistente (opcional)

El chat y el dictado por voz usan Groq. Sin la clave, el resto de la app anda igual.

```bash
npx wrangler secret put GROQ_API_KEY -c dist/server/wrangler.json
```

Pega la clave cuando la pida. La clave queda en Cloudflare, nunca en el repo.

## Notas

- La tabla `app_state` se crea sola la primera vez que se guarda algo. No hace falta correr migraciones.
- Para volver a publicar después de un cambio: `npm run deploy`.
- Para ver errores en vivo: `npx wrangler tail control-de-obra`.
- **La app no tiene login**: cualquiera con el link ve y edita los datos de la obra.
