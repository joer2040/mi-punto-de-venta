# Supabase Edge Functions Auth

Esta guia documenta el patron que debe usar este proyecto para autenticar Edge Functions
sin repetir errores de integracion con Supabase.

## Problema que queremos evitar

Si una funcion protegida se despliega con la verificacion JWT built-in activa en un proyecto
que emite tokens `ES256`, Supabase puede rechazar la llamada antes de ejecutar el codigo de la
funcion.

Sintoma tipico:

```json
{"code":"UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM","message":"Unsupported JWT algorithm ES256"}
```

Ese error no necesariamente significa que el codigo de la funcion este mal. Muchas veces indica
que la plataforma nunca llego a ejecutar la funcion porque el chequeo JWT legacy fallo primero.

## Patron correcto del proyecto

Todas las funciones protegidas deben seguir esta separacion:

### 1. Request client

Se usa solo para resolver al usuario autenticado.

- key: `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- headers globales: `Authorization` del request entrante
- llamada: `requestClient.auth.getUser()`

### 2. Admin client

Se usa solo para operaciones privilegiadas sobre la base.

- key: `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
- no debe usarse para autenticar al usuario del request

## Estructura recomendada

```ts
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const publishableKey =
  Deno.env.get('PROJECT_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const authorization = req.headers.get('Authorization')

if (!authorization) {
  return json({ error: 'No se recibio token de autenticacion.' }, 401)
}

const requestClient = createClient(supabaseUrl, publishableKey, {
  global: {
    headers: {
      Authorization: authorization,
    },
  },
})

const adminClient = createClient(supabaseUrl, serviceRoleKey)

const { data, error } = await requestClient.auth.getUser()
if (error || !data?.user) {
  return json({ error: 'Sesion invalida o expirada.' }, 401)
}

const user = data.user
```

## Regla de despliegue obligatoria

Las funciones protegidas de este proyecto deben desplegarse con:

```powershell
--no-verify-jwt
```

Ejemplo:

```powershell
npm exec supabase functions deploy cash-operations -- --project-ref <project-ref> --no-verify-jwt
```

Motivo:

- el chequeo JWT built-in de Supabase es legacy
- con tokens `ES256` puede bloquear la peticion antes de entrar a tu codigo
- al desactivarlo, la autenticacion la controlamos dentro de la funcion con el patron correcto

## Cosas que no debemos volver a hacer

- validar sesion con `SERVICE_ROLE_KEY` usando `auth.getUser()`
- depender de `PROJECT_LEGACY_SERVICE_ROLE_KEY`
- llamar manualmente a `/auth/v1/user` para autenticar requests de usuario
- desplegar funciones protegidas sin `--no-verify-jwt`
- documentar secretos legacy como requisito actual del proyecto

## Inventario actual de funciones protegidas

Estas funciones deben mantenerse homologadas en autenticacion y despliegue:

- `cash-operations`
- `pos-operations`
- `user-admin`
- `erp-operations`

## Checklist antes de crear o modificar una Edge Function

1. Definir si la funcion es protegida o publica.
2. Si es protegida, usar `requestClient` + `adminClient`.
3. Confirmar que use `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`.
4. Confirmar que el `adminClient` solo use `SERVICE_ROLE_KEY`.
5. Confirmar que no existe codigo legacy con `/auth/v1/user`.
6. Desplegar con `--no-verify-jwt`.
7. Probar una llamada autenticada real desde la app.
8. Si falla antes de entrar al codigo, revisar primero configuracion de deploy, no la logica de negocio.

## Nota operativa

Si el repo vuelve a mostrar documentacion que mencione `PROJECT_LEGACY_SERVICE_ROLE_KEY`
como requisito obligatorio para funciones protegidas, esa documentacion esta desactualizada
y debe corregirse.
