---
version: 1
slug: "src-app-features-public-home-home-page-html"
primary_target: "src/app/features/public/home/home-page.html"
related_targets: ["src/app/layouts/public-layout/public-layout.html","src/app/features/public/catalog/catalog-page.html"]
---

# Tienda pública Farmasalud

Scope: tienda pública (home, catálogo, ficha, carrito, checkout, seguimiento, auth, layout público). Home = Persuade; catálogo, carrito, checkout y seguimiento = Operate dentro del mismo mundo.
Audiencia: familias de Trujillo en el celular. Acción: buscar un medicamento en una botica concreta y agregarlo al carrito. Prueba: stock real por botica y seguimiento del pedido. Sin claims inventados; el pago es simulado.
Momento memorable: la línea de ruta con las boticas como paraderos; elegir una la enciende y el pedido luego recorre la misma línea.

## Direction contract

THESIS: Las 10 boticas son paraderos de una sola ruta trujillana. Rechaza la farmacia blanca con teal, íconos de pastilla y tarjetas flotantes (el hero de tres cards actual).

OWN-WORLD: Esmalte de carrocería claro (#f2f4f1) como fondo, tinta azul noche (#0f1a2e), franja de ruta cobalto (#1440a8) y marigold (#ffbe1a) como bandas estructurales a todo el ancho; verde vivo (#0e9a57) SOLO para estados en vivo (stock disponible, pedido en marcha); rojo (#d42f2a) solo para alertas. Letra de rótulo condensada (Archivo, ancho 62–75, 800–900) para titulares y números de paradero; Atkinson Hyperlegible Next para el cuerpo. Paraderos = círculos numerados sobre una línea gruesa. Esquinas casi rectas, sin sombras difusas ni gradientes.

STORY: El visitante entiende en una línea que puede ver stock real en su botica, elige su paradero, busca el medicamento y lo agrega; luego ve su pedido avanzar por la misma ruta.

FIRST VIEWPORT: Letrero a todo el ancho sobre franja cobalto: kicker "RUTA FARMASALUD · TRUJILLO", titular condensado enorme en esmalte con palabra clave en marigold, buscador funcional (input + botón) como acción primaria dentro del letrero. Debajo, cruzando la pantalla, la línea de ruta con las boticas reales como paraderos numerados (scroll horizontal en móvil); la seleccionada se enciende en verde y fija la botica del catálogo.

FORM: Letrero de ruta (tableros de micros trujillanas), candidato 4 de 7 en la lista ordenada; seed:7920edc40ec831ba. Interacción firma: selector de botica como línea de ruta y seguimiento del pedido como el bus avanzando por paraderos. Gramática de movimiento: deslizamiento horizontal a lo largo de la línea (view transitions de ruta, encendido de paradero, entrada escalonada), con prefers-reduced-motion respetado.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
