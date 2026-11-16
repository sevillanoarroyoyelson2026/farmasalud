# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Cliente (tienda pública):** pacientes y familias de Trujillo que necesitan un medicamento o producto de cuidado personal, sobre todo desde el celular. Quieren saber si hay stock en una botica cercana, subir la receta si hace falta, pagar y recibir o recoger sin hacer colas.
- **Trabajador de botica (/trabajador):** personal de una sucursal que atiende la cola de pedidos, valida recetas, prepara y despacha (lote FEFO indicado) y registra la recepción de mercadería.
- **Administrador (/admin):** gestiona catálogo, stock por lote y sucursal, proveedores, cotizaciones, órdenes de compra, promociones, reclamos, usuarios y reportes.

## Product Purpose
Sistema web de e-commerce y gestión interna para Farmasalud E.I.R.L., una cadena ficticia de 10 boticas en Trujillo (Perú). Es un **proyecto académico/demo**: caso de estudio universitario con indicadores del T2 y pago simulado, que será presentado y evaluado. No hay clientes reales. Un buen resultado es un sistema que se sienta como un producto real, profesional y confiable al demostrarlo.

## Positioning
Stock real por botica antes de comprar, receta validada por un farmacéutico y seguimiento del pedido en vivo. Todo esto en un solo flujo que conecta la tienda con la operación interna (cola del trabajador, lotes FEFO, compras).

## Operating Context
- La tienda se usa principalmente en móvil. Los paneles internos se usan en escritorio o en tablet de mostrador.
- Flujo de compra: elegir botica → ver stock → carrito → checkout (delivery o recojo, receta privada, pago simulado con Culqi) → seguimiento → calificación. También existe el Libro de Reclamaciones (requisito legal peruano).
- La demo corre con los emuladores de Firebase y datos semilla (`npm run seed:emulator`).

## Capabilities and Constraints
- Angular 21 (standalone + signals), Bootstrap 5, Font Awesome 6, Firebase (Auth, Firestore, App Check), Netlify Functions, Culqi y Cloudinary (imágenes de producto).
- El pago es simulado: la interfaz no debe dar a entender cobros reales.
- Idioma de la interfaz: español (Perú).

## Brand Commitments
No hay logo ni colores oficiales. La identidad visual es libre: la paleta teal/verde actual se puede afinar o reemplazar.

## Evidence on Hand
- Imágenes de producto subidas por el admin vía Cloudinary. Pueden faltar, así que la interfaz necesita un estado sin imagen digno.
- No hay testimonios, cifras de clientes, certificaciones, tiempos de entrega garantizados ni prensa. No inventarlos. Los textos de ejemplo (p. ej. "35 minutos") son ilustrativos.

## Product Principles
1. **Confianza antes que espectáculo:** es salud; la claridad sobre stock, receta y estado del pedido manda.
2. **La verdad del inventario es el diferenciador:** la disponibilidad por botica debe verse siempre y a primera vista.
3. **Móvil primero para el cliente; densidad y velocidad para el personal.**
4. **Cada acción se confirma:** agregar, pagar o cambiar de estado siempre da feedback visible.

## Accessibility & Inclusion
WCAG 2.2 AA. Usuarios de todas las edades (incluidos adultos mayores comprando medicamentos): texto legible, objetivos táctiles amplios, respeto a `prefers-reduced-motion`.
