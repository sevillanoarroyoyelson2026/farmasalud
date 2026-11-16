---
name: Farmasalud
description: Tienda en línea de 10 boticas en Trujillo, pintada como el letrero de una ruta de micro.
colors:
  route-enamel: "#f2f4f1"
  route-enamel-deep: "#e6eae3"
  route-ink: "#0f1a2e"
  route-ink-soft: "#3d4a60"
  route-cobalt: "#1440a8"
  route-cobalt-deep: "#0c2c7a"
  route-cobalt-wash: "#e4eafa"
  route-marigold: "#ffbe1a"
  route-marigold-deep: "#e9a400"
  route-marigold-wash: "#fff3cc"
  marigold-hover: "#ffcd4d"
  route-live: "#0e9a57"
  route-live-ink: "#0a7444"
  route-live-wash: "#dcf2e5"
  route-alert: "#c42b26"
  route-alert-wash: "#fde4e2"
  warning-ink: "#a65a00"
  text-muted: "#5d6880"
  border: "#d5dbd2"
  border-strong: "#b9c1b5"
  surface: "#ffffff"
  cobalt-mist: "#dce5fb"
  night-board-text: "#b3bfd6"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "clamp(2.5rem, 6.4vw, 5rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 66"
  headline:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 72"
  title:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 800
    lineHeight: 1.2
    fontVariation: "'wdth' 85"
  numeral:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 900
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 85"
  body:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 85"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  stop: "50%"
spacing:
  gutter: "1rem"
  route-line: "6px"
  route-stop: "2.75rem"
  touch-target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.route-cobalt}"
    textColor: "{colors.surface}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.route-cobalt-deep}"
  button-signal:
    backgroundColor: "{colors.route-marigold}"
    textColor: "{colors.route-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    height: "3.25rem"
    padding: "0 1.5rem"
  button-signal-hover:
    backgroundColor: "{colors.marigold-hover}"
  button-signal-active:
    backgroundColor: "{colors.route-marigold-deep}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.route-cobalt}"
    rounded: "{rounded.sm}"
    height: "44px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.route-ink}"
    rounded: "{rounded.sm}"
    height: "2.75rem"
  chip-category:
    backgroundColor: "{colors.route-enamel-deep}"
    textColor: "{colors.route-ink-soft}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0.35rem 0.9rem"
  chip-category-selected:
    backgroundColor: "{colors.route-cobalt}"
    textColor: "{colors.surface}"
  status-badge-live:
    backgroundColor: "{colors.route-live-wash}"
    textColor: "{colors.route-live-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.2rem 0.55rem"
  card-product:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0.9rem 1rem 1rem"
  route-stop-marker:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.route-ink}"
    rounded: "{rounded.stop}"
    size: "{spacing.route-stop}"
  route-stop-marker-selected:
    backgroundColor: "{colors.route-live}"
    textColor: "{colors.surface}"
  discount-plate:
    backgroundColor: "{colors.route-marigold}"
    textColor: "{colors.route-ink}"
    rounded: "{rounded.sm}"
    height: "3rem"
---

# Design System: Farmasalud

## Overview

**Creative North Star: "Letrero de ruta"**

Las diez boticas de Farmasalud son paraderos de una sola ruta trujillana, y la tienda está pintada como la carrocería y los tableros de una micro: esmalte claro de fondo, franjas cobalto y marigold a todo el ancho, tinta azul noche para el texto y los tableros nocturnos, y una letra de rótulo condensada para todo lo que se lee de lejos. Las boticas se eligen como paraderos numerados sobre una línea gruesa, y el pedido luego avanza por esa misma línea.

El sistema es plano y gráfico, no flotante: la profundidad se pinta con franjas (sombras `inset` de color sólido) antes que con elevación. El color es estructural (bandas, letreros, placas) y tiene funciones fijas: el cobalto es la ruta y la acción, el marigold es la señal, el verde aparece solo cuando algo está en vivo y el rojo solo cuando algo está mal. La densidad es de tienda práctica para celular: objetivos táctiles de 44px, cifras tabulares, cuerpo hiperlegible.

Alcance: las superficies de la tienda (layout público, inicio, catálogo, ficha, carrito, checkout, seguimiento, autenticación) están construidas en este mundo. Los paneles de personal (`/admin`, `/trabajador`) solo heredan los valores de los tokens y todavía no se han rediseñado; sus tablas y su barra lateral conservan patrones anteriores y no son referencia de este sistema. La transición de ruta entre páginas se omite a propósito en esos paneles.

**Key Characteristics:**
- Franjas de carrocería cobalto + marigold como firma estructural (cabecera, letreros, pie, cierres).
- Titulares en Archivo condensado (ancho 66–72%, peso 800–900) en mayúsculas; cuerpo en Atkinson Hyperlegible Next.
- Paraderos numerados (círculos con borde cobalto) sobre una línea de ruta de 6px; el seleccionado se enciende en verde.
- Esquinas casi rectas (4–6px); el círculo se reserva para paraderos y marcas de estado.
- Movimiento como deslizamiento horizontal a lo largo de la ruta, siempre con `prefers-reduced-motion` respetado.

## Colors

Una paleta de señalética de transporte: esmalte claro, tinta azul noche y dos colores de franja, más dos colores de estado con funciones estrictas.

### Primary
- **Cobalto de ruta** (route-cobalt): la franja de la ruta y la acción principal. Fondo de los letreros (inicio, catálogo), línea de ruta, borde de los paraderos, botón primario, enlaces, subrayado de navegación activa, chips seleccionados. Su versión profunda (route-cobalt-deep) es el hover y el texto de las etiquetas informativas; su lavado (route-cobalt-wash) es el fondo de hover de controles y de bloques informativos.

### Secondary
- **Marigold de señal** (route-marigold): la segunda franja y el color de "mira aquí". Botón de señal (Buscar, Ver catálogo), palabra clave del titular sobre cobalto, placa de descuento, contador del carrito, vehículo de la ruta, anillo de foco, selección de texto. Hover más claro (marigold-hover), pulsado más profundo (route-marigold-deep, también usado para las estrellas de reseña). Su lavado (route-marigold-wash) es el fondo de los avisos de advertencia.

### Tertiary
- **Verde en vivo** (route-live): solo para lo que está ocurriendo ahora: paradero seleccionado, paso actual del pedido, interruptor "solo disponibles" activo, confirmación de agregado al carrito. Su tinta (route-live-ink) es el texto de stock disponible y de las etiquetas de éxito; su lavado (route-live-wash) el fondo de esas etiquetas.
- **Rojo de alerta** (route-alert): solo para errores, validación inválida, acciones destructivas (cerrar sesión, cancelar) y etiquetas de peligro, sobre su lavado (route-alert-wash).
- **Ámbar de advertencia** (warning-ink): rol semántico de advertencia sobre el lavado marigold.

### Neutral
- **Esmalte de carrocería** (route-enamel): fondo de toda la tienda. Su versión profunda (route-enamel-deep) es el fondo de chips, etiquetas neutras, insignia "Delivery" y la base de los esqueletos.
- **Tinta azul noche** (route-ink): todo el texto principal y el fondo de los tableros nocturnos (barra superior, pie, banda de cierre, seguimiento, aviso de carrito). Sobre tinta, el texto secundario es night-board-text.
- **Tinta suave** (route-ink-soft): texto secundario sobre esmalte o blanco. **Gris de horario** (text-muted): placeholders, metadatos y precio anterior tachado.
- **Superficie** (surface): tarjetas, cabecera, campos y filas al pasar el cursor.
- **Bordes** (border, border-strong): divisores finos de tarjetas; el fuerte para campos, controles con borde y filas del tablero.
- **Niebla cobalto** (cobalt-mist): texto de apoyo sobre el letrero cobalto.

### Named Rules
**The Live Green Rule.** El verde significa "en vivo": stock disponible, paradero elegido, pedido en marcha, recién agregado. Nunca se usa como color de marca, de decoración ni de botón primario.

**The Two-Stripe Rule.** Cuando una banda de ruta separa regiones, va en pareja cobalto + marigold, pintada como sombra `inset` sólida o borde (cabecera: 5px cobalto + 4px marigold; pie: 9px cobalto + 4px marigold), nunca como degradado.

**The Signal Scarcity Rule.** Hay como máximo una acción marigold por región: el marigold marca la señal principal y pierde fuerza si se reparte.

## Typography

**Display Font:** Archivo variable (ancho 62–100, peso 500–900), con Arial Narrow de respaldo
**Body Font:** Atkinson Hyperlegible Next (400–700), con Segoe UI y system-ui de respaldo

**Character:** Letra de rótulo de micro, condensada y pesada, contra un cuerpo diseñado para la legibilidad de baja visión. Archivo habla; Atkinson explica.

### Hierarchy
- **Display** (900, clamp(2.5rem, 6.4vw, 5rem), interlineado 0.92, ancho 66%, MAYÚSCULAS): solo el titular de un letrero (inicio, catálogo a clamp(2.4rem, 6vw, 4rem)). Una palabra clave puede ir en marigold sobre cobalto.
- **Headline** (800, clamp(1.9rem, 3.6vw, 2.6rem), interlineado 1.05, ancho 72%, MAYÚSCULAS): títulos de sección y de página (carrito, checkout y pedido usan clamp(2.2rem, 5vw, 3.25rem) a ancho 68%).
- **Title** (800, 1.05–1.2rem, ancho 85%): nombres de producto, nombres de paradero, títulos de paso.
- **Numeral** (900, ancho 72–85%, cifras tabulares): números de paradero, precios (1.3rem; 2.6rem en la ficha), porcentajes de descuento.
- **Body** (400, 1rem, interlineado 1.55): texto corrido y descripciones, hasta 46–68ch.
- **Label** (700–800, 0.75–0.95rem, tracking 0.04–0.08em, ancho 85%, MAYÚSCULAS): navegación, botones, etiquetas de estado, títulos del pie, términos de fichas técnicas.

### Named Rules
**The Sign Letter Rule.** Archivo siempre lleva `font-stretch` (66–72% para titulares, 85% para etiquetas, botones y nombres); sin ancho, deja de ser letra de rótulo.

**The Tabular Figures Rule.** Precios, stock, cantidades, números de paradero y tiempos usan cifras tabulares.

## Layout

Contenedor `container-xl` de Bootstrap con 1rem de margen lateral. Las bandas estructurales (letrero, franjas, cierre, pie) corren a todo el ancho; el contenido vive dentro del contenedor. Las secciones se separan con rellenos fluidos (clamp(3rem, 6vw, 4.5rem) aprox.), no con tarjetas.

Las listas tienen forma de ruta o de tablero: la línea de boticas es una grilla de N columnas sobre la línea de 6px, con desplazamiento horizontal y `scroll-snap` en móvil (mínimo 9.5rem por paradero); el tablero de ofertas son filas en grilla separadas por reglas, con 4px de tinta arriba; la compra son cuatro paraderos en fila que pasan a vertical por debajo de 992px. El catálogo usa una grilla `auto-fill` de mínimo 230px que baja a dos columnas en móvil.

Puntos de quiebre: los de Bootstrap (576, 768, 992, 1200px). La navegación colapsa a menú desplegable bajo 992px. Todos los controles táctiles miden al menos 44px.

## Elevation & Depth

Sistema híbrido, plano por defecto. La profundidad estructural se pinta con franjas sólidas (`box-shadow: inset` de color, sin desenfoque): cabecera, letreros, aviso de carrito, menú desplegable, carrito y pie. La elevación con sombra difusa está teñida de tinta, tiene spread negativo y aparece por estado o por capa: tarjetas de contenido en reposo (sombra baja), tarjetas de producto al pasar el cursor, menús desplegables, aviso flotante, cabecera al hacer scroll y el buscador del letrero.

### Shadow Vocabulary
- **Tarjeta** (`0 1px 0 rgba(15, 26, 46, 0.05), 0 8px 20px -14px rgba(15, 26, 46, 0.35)`): superficies de contenido en reposo.
- **Elevada** (`0 2px 4px rgba(15, 26, 46, 0.06), 0 22px 44px -18px rgba(15, 26, 46, 0.4)`): hover de tarjeta de producto, menús, aviso de carrito, menú móvil.
- **Franja** (`inset 0 -4px 0` marigold + `inset 0 -9px 0` cobalto): bandas de carrocería.

### Named Rules
**The Painted Depth Rule.** Primero franja, después sombra: una región se distingue con una banda pintada o un cambio de fondo (esmalte, blanco, tinta) antes de recurrir a la elevación.

## Shapes

Esquinas casi rectas: 4px en botones, campos, chips, etiquetas y placas; 6px en tarjetas y en el tablero de seguimiento; 10px solo en contenedores de diálogo y autenticación. El círculo es una forma con significado: paraderos, marcas de paso y el punto de las etiquetas de estado. Las píldoras de botica del catálogo son la única forma de píldora, porque son paraderos compactos. La línea de ruta es sólida donde ya se recorrió y punteada (franjas repetidas) donde falta recorrer. El vehículo es una placa marigold de 4px con una pequeña flecha triangular hacia el paradero.

## Components

### Buttons
Contundentes y de rótulo: Archivo 700 al 85% de ancho, se hunden 1px al pulsar.
- **Shape:** casi rectos (4px); `btn-lg` de 3.25rem de alto y 1.5rem de relleno.
- **Primary:** cobalto con texto blanco; hover cobalto profundo. Acción de compra (Agregar, Crear cuenta).
- **Signal:** marigold con texto tinta, para la señal principal sobre cobalto o tinta (Buscar, Ver catálogo). Hover más claro, pulsado más profundo.
- **Outline:** borde cobalto de 2px, se rellena de cobalto en hover.
- **Hover / Focus:** transiciones de 0.22s con `cubic-bezier(0.16, 1, 0.3, 1)`; foco universal con contorno marigold de 3px más anillo de tinta de 5px.

### Chips
- **Style:** fondo esmalte profundo, texto tinta suave, Archivo 700, 40px de alto, 4px de radio.
- **State:** hover con borde y texto cobalto; seleccionado cobalto con texto blanco.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** blanco sobre esmalte.
- **Shadow Strategy:** sombra de tarjeta en reposo en contenedores de contenido; la tarjeta de producto es plana con borde y sube 3px con sombra elevada al pasar el cursor.
- **Border:** 1px borde suave.
- **Internal Padding:** 0.9–1.25rem.
- La tarjeta entera es clicable mediante enlace extendido, salvo el botón de agregar. Sin foto, se muestra la inicial del producto en letra de rótulo. Agotado: imagen en escala de grises.

### Inputs / Fields
- **Style:** blanco, borde fuerte de 1.5px, 4px de radio, 2.75rem de alto mínimo.
- **Focus:** borde cobalto más halo cobalto al 18%. En los buscadores de letrero, el foco es el contorno marigold.
- **Error / Disabled:** borde rojo de alerta.

### Navigation
Cabecera blanca y fija con las dos franjas abajo; placa de marca (letra F marigold sobre cobalto) y nombre en display. Enlaces en etiqueta mayúscula tinta suave; hover tinta con medio subrayado; activo en cobalto con un tramo de 3px que se dibuja de izquierda a derecha. Carrito con borde y contador marigold que salta en verde al cambiar. Bajo 992px, menú desplegable con borde inferior cobalto de 4px.

### Status Badges
Etiquetas de rótulo (Archivo 700, 0.78rem) con lavado y tinta por estado, y una marca de forma además del color: círculo (disponible, info), rombo (advertencia), cuadrado (peligro), círculo hueco (neutro, agotado).

### Route Line (firma)
Paraderos numerados de 2.75rem (borde cobalto de 5px, fondo blanco, cifra display) sobre una línea cobalto de 6px. Hover: el paradero se pinta marigold y sube 2px. Seleccionado: se enciende en verde vivo, crece al 112% y emite un pulso; la placa del vehículo viaja hasta él. En el catálogo la misma idea se compacta en píldoras con marcador numerado (seleccionada: fondo tinta, marcador verde).

### Order Tracking (firma)
Tablero de tinta con franja marigold inferior. Los pasos son puntos sobre tramos: punteados si faltan, cobalto sólido si ya se recorrieron; el paso actual es verde con pulso continuo; el vehículo marigold se ubica sobre él.

### Offers Board
Tablero de salidas: placa marigold con el porcentaje, nombre en título, etiqueta de stock, precio tabular y botón primario por fila; filas separadas por reglas, regla de tinta de 4px arriba.

### Cart Notice
Aviso flotante abajo a la derecha en tinta con franja marigold, check verde, enlace marigold "Ver carrito"; llega deslizándose desde la derecha y se cierra solo a los 3.6s.

### Motion
Gramática de deslizamiento horizontal, curva `cubic-bezier(0.16, 1, 0.3, 1)`: entrada escalonada (14px desde la izquierda, 45ms por elemento, máximo 12), aparición al hacer scroll (18px), transición entre páginas (sale 28px a la izquierda en 0.28s, entra 36px desde la derecha en 0.42s; omitida en paneles de personal), esqueletos con barrido en lugar de spinners. Todo se anula con `prefers-reduced-motion: reduce`, y el contenido es visible por defecto.

## Do's and Don'ts

### Do:
- **Do** separar regiones con la pareja de franjas cobalto + marigold pintadas como sombra `inset` sólida o borde.
- **Do** reservar el verde vivo para lo que ocurre ahora (stock disponible, paradero elegido, paso actual, recién agregado).
- **Do** poner `font-stretch` en todo uso de Archivo: 66–72% en titulares, 85% en etiquetas, botones y nombres.
- **Do** usar cifras tabulares para precios, stock, cantidades y números de paradero.
- **Do** acompañar el color de estado con una marca de forma (círculo, rombo, cuadrado, círculo hueco).
- **Do** mantener esquinas de 4–6px y reservar el círculo para paraderos y marcas de estado.
- **Do** mover a lo largo de la ruta (desplazamiento horizontal) y respetar `prefers-reduced-motion`.
- **Do** dar 44px mínimos a todo control táctil.

### Don't:
- **Don't** usar verde para marca, decoración o acciones primarias; la acción es cobalto y la señal es marigold.
- **Don't** usar rojo fuera de errores, validación y acciones destructivas.
- **Don't** volver a la farmacia blanca con teal, los íconos de pastilla ni el hero de tres tarjetas flotantes.
- **Don't** pintar las franjas de ruta con degradados de color; los únicos degradados del sistema son los tramos punteados de la ruta y el barrido de los esqueletos.
- **Don't** usar Archivo sin ancho condensado ni titulares en Atkinson.
- **Don't** tomar los paneles `/admin` y `/trabajador` como referencia de este mundo hasta que se rediseñen.
