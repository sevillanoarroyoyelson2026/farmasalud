import { Component } from '@angular/core';

/** Política de privacidad (Ley N.° 29733 de Protección de Datos Personales). */
@Component({
  selector: 'app-privacy-policy-page',
  template: `
    <article class="container-xl privacy-policy">
      <h1 class="page-title">Política de privacidad</h1>
      <p class="page-subtitle">Farmasalud E.I.R.L. — Av. Ricardo Palma 903, El Bosque, Trujillo</p>

      <section class="surface-card privacy-policy-section">
        <h2 class="h5">¿Qué datos recopilamos?</h2>
        <p>
          Nombre, correo electrónico, celular, dirección de entrega, historial de pedidos y, cuando el producto lo
          requiere, la imagen de tu receta médica. No guardamos los datos de tu tarjeta: el pago lo procesa la pasarela
          de pagos.
        </p>

        <h2 class="h5">¿Para qué los usamos?</h2>
        <p>
          Para gestionar tus pedidos, validar recetas, coordinar el delivery y enviarte la confirmación y el estado de tu
          compra. No vendemos ni compartimos tus datos con terceros ajenos a la entrega de tu pedido.
        </p>

        <h2 class="h5">¿Quién puede ver tu receta?</h2>
        <p>
          Solo tú y el personal farmacéutico de la botica que atiende tu pedido. Las recetas se guardan de forma privada
          y se muestran mediante enlaces temporales.
        </p>

        <h2 class="h5">Tus derechos</h2>
        <p class="mb-0">
          Puedes solicitar el acceso, la rectificación, la cancelación de tus datos o la eliminación de tu cuenta
          escribiendo a la farmacia. Atenderemos tu solicitud en los plazos que establece la Ley N.° 29733 y su
          reglamento.
        </p>
      </section>
    </article>
  `,
  styles: `
    .privacy-policy {
      max-width: 820px;
      padding: 3rem 1rem 0;
    }
    .privacy-policy-section {
      padding: 1.75rem;
    }
    .privacy-policy-section h2 {
      margin-top: 1.25rem;
    }
    .privacy-policy-section h2:first-child {
      margin-top: 0;
    }
    .privacy-policy-section p {
      color: var(--color-text-secondary);
    }
  `,
})
export class PrivacyPolicyPage {}
