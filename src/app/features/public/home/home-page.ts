import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { hasActivePromotion, Product } from '../../../shared/models/product';
import { ProductPrice } from '../../../shared/ui/product-price/product-price';

const MAXIMUM_FEATURED_PROMOTIONS = 4;

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
  imports: [RouterLink, ProductPrice],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage implements OnInit {
  private readonly productRepository = inject(ProductRepository);

  readonly purchaseSteps = PURCHASE_STEPS;
  readonly promotedProducts = signal<Product[]>([]);

  /** Ofertas vigentes con mayor descuento primero. Si falla, la sección simplemente no aparece. */
  async ngOnInit(): Promise<void> {
    try {
      const activeProducts = await this.productRepository.findActiveProducts();
      this.promotedProducts.set(
        activeProducts
          .filter((product) => hasActivePromotion(product))
          .sort((firstProduct, secondProduct) => (secondProduct.promotion?.discountPercent ?? 0) - (firstProduct.promotion?.discountPercent ?? 0))
          .slice(0, MAXIMUM_FEATURED_PROMOTIONS),
      );
    } catch {
      this.promotedProducts.set([]);
    }
  }
}
