import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface PurchaseStep {
  iconClass: string;
  title: string;
  description: string;
}

/** Pasos del proceso de atención y dispensación digital (procedimiento 04.02 del informe T2). */
const PURCHASE_STEPS: PurchaseStep[] = [
  {
    iconClass: 'fas fa-store',
    title: 'Elige tu botica',
    description: 'Ves el stock real de la botica más cercana antes de comprar.',
  },
  {
    iconClass: 'fas fa-file-prescription',
    title: 'Sube tu receta',
    description: 'Si el medicamento la requiere, un farmacéutico la valida antes de despachar.',
  },
  {
    iconClass: 'fas fa-credit-card',
    title: 'Paga seguro',
    description: 'Pago en línea con tarjeta a través de una pasarela certificada.',
  },
  {
    iconClass: 'fas fa-truck-fast',
    title: 'Recibe en casa',
    description: 'Sigue el estado de tu pedido hasta la entrega.',
  },
];

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  readonly purchaseSteps = PURCHASE_STEPS;
}
