import { Routes } from '@angular/router';
import { requireAuthenticatedUserGuard } from '../../core/guards/auth.guard';
import { customerShoppingAreaGuard, guestOnlyGuard } from '../../core/guards/public-area.guard';
import { PublicLayout } from '../../layouts/public-layout/public-layout';

export const PUBLIC_ROUTES: Routes = [
  {
    path: '',
    component: PublicLayout,
    children: [
      {
        path: '',
        title: 'Farmasalud | Tu farmacia en línea en Trujillo',
        loadComponent: () => import('./home/home-page').then((module) => module.HomePage),
      },
      {
        path: 'login',
        title: 'Iniciar sesión | Farmasalud',
        canActivate: [guestOnlyGuard],
        loadComponent: () => import('./login/login-page').then((module) => module.LoginPage),
      },
      {
        path: 'registro',
        title: 'Crear cuenta | Farmasalud',
        canActivate: [guestOnlyGuard],
        loadComponent: () => import('./register/register-page').then((module) => module.RegisterPage),
      },
      {
        path: 'privacidad',
        title: 'Política de privacidad | Farmasalud',
        loadComponent: () =>
          import('./privacy-policy/privacy-policy-page').then((module) => module.PrivacyPolicyPage),
      },
      {
        path: 'catalogo',
        title: 'Catálogo | Farmasalud',
        loadComponent: () => import('./catalog/catalog-page').then((module) => module.CatalogPage),
      },
      {
        path: 'producto/:productId',
        title: 'Producto | Farmasalud',
        loadComponent: () =>
          import('./product-detail/product-detail-page').then((module) => module.ProductDetailPage),
      },
      {
        path: 'carrito',
        title: 'Carrito | Farmasalud',
        canActivate: [customerShoppingAreaGuard],
        loadComponent: () => import('./cart/cart-page').then((module) => module.CartPage),
      },
      {
        path: 'checkout',
        title: 'Finalizar compra | Farmasalud',
        canActivate: [requireAuthenticatedUserGuard, customerShoppingAreaGuard],
        loadComponent: () => import('./checkout/checkout-page').then((module) => module.CheckoutPage),
      },
      {
        path: 'mis-pedidos',
        title: 'Mis pedidos | Farmasalud',
        canActivate: [requireAuthenticatedUserGuard, customerShoppingAreaGuard],
        loadComponent: () =>
          import('./customer-orders/customer-orders-page').then((module) => module.CustomerOrdersPage),
      },
      {
        path: 'mis-pedidos/:orderId',
        title: 'Seguimiento del pedido | Farmasalud',
        canActivate: [requireAuthenticatedUserGuard, customerShoppingAreaGuard],
        loadComponent: () =>
          import('./customer-orders/customer-order-detail-page').then((module) => module.CustomerOrderDetailPage),
      },
    ],
  },
];
