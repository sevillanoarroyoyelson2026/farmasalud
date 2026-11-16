# Farmasalud — E-commerce y gestión interna

Sistema web responsivo para **Farmasalud E.I.R.L.** (10 boticas en Trujillo): catálogo y venta en línea, inventario por lotes y sucursal, compras a proveedores y delivery. Basado en la arquitectura del POS *Alliker* (layouts por rol, login con Google, Netlify Functions + Firebase Admin), con mejoras de seguridad.

| Rol | Ruta | Qué hace |
|---|---|---|
| Cliente | `/` | Catálogo, carrito, pago, receta, seguimiento |
| Trabajador | `/trabajador` | Cola de pedidos, recetas, despacho, recepción de mercadería |
| Administrador | `/admin` | Catálogo, stock, proveedores, compras, usuarios, reportes |

## Módulos
- **Tienda (cliente):** catálogo con stock real por botica, ofertas, ficha, carrito, checkout (delivery o recojo, receta privada, **pago simulado**), seguimiento en vivo, calificación del pedido y Libro de Reclamaciones.
- **Trabajador (su sucursal):** cola de pedidos, validación de recetas, preparación y despacho (lote FEFO indicado), recepción de mercadería y alertas de stock.
- **Administrador:** dashboard con indicadores del T2, pedidos, delivery, promociones, reclamos, productos, categorías, lotes y stock, proveedores, cotizaciones (comparación y adjudicación), órdenes de compra, recepción, sucursales, usuarios y reportes (CSV).

## Stack
Angular 21 (standalone + signals) · Bootstrap 5 · Firebase 13 (Auth + Firestore + App Check) · Netlify Functions (Firebase Admin 14, zod 4) · Culqi · Cloudinary.

## Estructura
```
src/app/
  core/       auth (sesión, roles), guards, firebase, http, logger
  layouts/    public-layout · admin-layout · worker-layout
  features/   public/ · admin/ · worker/   (una carpeta por pantalla)
  shared/     ui (panel-shell, …), data-access (repositorios), models, validators
netlify/
  functions/  un archivo = un endpoint /api/<nombre>
  lib/        código compartido del servidor (auth, validación, rate limit, auditoría)
firestore.rules · tests/firestore-rules/ · scripts/
```

## Puesta en marcha (desarrollo con emuladores)
Requisitos: Node 22+ y **Java 11+** (lo necesita el emulador de Firestore).

```bash
npm install
npm run emulators          # terminal 1: Auth + Firestore locales (UI en :4000)
npm run seed:emulator      # crea 2 sucursales y usuarios de prueba (clave Farma2026)
cp .env.example .env
npm run dev:full           # terminal 2: netlify dev → app + functions en http://localhost:8888
```
Usuarios de prueba: `admin@farmasalud.test`, `trabajador@farmasalud.test`, `cliente@farmasalud.test`.

## Comandos
| Comando | Uso |
|---|---|
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:rules` | Pruebas de reglas de Firestore en el emulador (requiere Java 11+) |
| `npm run test:e2e` | Prueba de punta a punta contra Firebase real con `npm run dev:full` encendido; crea datos de prueba y los borra al terminar |
| `npm run typecheck:functions` | Revisión de tipos de las functions |
| `npm run build` | Build de producción |
| `npm run audit:security` | `npm audit` de dependencias de producción |

## Despliegue en Netlify
Netlify → *Add new project* → *Import from GitHub* → este repositorio. El build (`npm run build`), la carpeta publicada y las functions ya están en `netlify.toml`.

Variables de entorno (Site configuration → Environment variables). Todas son **secretas** salvo `ALLOWED_ORIGIN` y `REQUIRE_APP_CHECK`:

| Variable | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | JSON de la cuenta de servicio de Firebase, en una sola línea |
| `ALLOWED_ORIGIN` | URL pública del sitio, p. ej. `https://farmasalud.netlify.app` (sin `/` final) |
| `REQUIRE_APP_CHECK` | `false` (cambiar a `true` cuando se configure reCAPTCHA v3 / App Check) |
| `CLOUDINARY_CLOUD_NAME` | Cloud name de Cloudinary |
| `CLOUDINARY_API_KEY` | API key de Cloudinary |
| `CLOUDINARY_API_SECRET` | API secret de Cloudinary |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Opcionales: correos al cliente (pedido registrado, cambios de estado, respuesta a reclamos). Sin ellas no se envían correos y todo lo demás funciona igual |
| `CULQI_SECRET_KEY` | Opcional: cobro real con Culqi (requiere además `culqiPublicKey` en `environment.ts`). Sin ella, pago simulado |

**No** crear en Netlify `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` ni `FIREBASE_PROJECT_ID` (son solo para emuladores locales).

Después del primer deploy: Firebase → Authentication → Configuración → **Dominios autorizados** → agregar el dominio de Netlify (sin esto el login con Google falla).

## Producción
1. Crear proyecto Firebase: habilitar Auth (Google + correo), Firestore, **App Check con reCAPTCHA v3** y la *password policy* (mín. 8, letras y números).
2. Poner la configuración web pública en `src/environments/environment.ts`.
3. En Netlify, variables: `FIREBASE_SERVICE_ACCOUNT_KEY`, `ALLOWED_ORIGIN`, `REQUIRE_APP_CHECK=true` (y luego las de Culqi/Cloudinary).
4. `firebase deploy --only firestore:rules,firestore:indexes`.
5. Primer administrador: registrarse en la web y ejecutar
   `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/promote-first-admin.mjs correo@...`

## Seguridad (resumen)
- Rol y sucursal en **custom claims**; los asigna solo el servidor. La sesión nunca se guarda en localStorage.
- Reglas de Firestore **cerradas por defecto**; stock y dinero solo se modifican desde functions.
- Functions: verificación de ID token (con revocación), App Check, validación zod estricta, límite de peticiones, CORS restringido, errores genéricos y `audit_logs`.
- Cabeceras CSP, HSTS, X-Frame-Options, etc. en `netlify.toml`.
- Consentimiento de datos personales (Ley N.° 29733) registrado con versión de la política.
