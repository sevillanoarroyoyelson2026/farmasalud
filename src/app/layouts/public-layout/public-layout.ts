import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HOME_ROUTE_BY_ROLE, ROLE_DISPLAY_NAME } from '../../core/auth/user-role';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { CartService } from '../../shared/data-access/cart.service';
import { CategoryRepository } from '../../shared/data-access/category.repository';
import { Category } from '../../shared/models/category';
import { DELIVERY_FEE_IN_SOLES } from '../../shared/models/order';
import { CartNoticeComponent } from '../../shared/ui/cart-notice/cart-notice';

/**
 * Layout de la tienda: franja promocional, cabecera con buscador y categorías,
 * aviso de correo sin verificar, contenido, beneficios y pie de página.
 */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CartNoticeComponent],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.css',
  host: {'(window:scroll)': 'onWindowScroll()'},
})
export class PublicLayout implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly logger = inject(AppLoggerService);

  readonly currentSession = this.authService.currentSession;
  readonly cartUnits = inject(CartService).totalUnits;
  readonly isMobileMenuOpen = signal(false);
  readonly isUserMenuOpen = signal(false);
  /** Al hacer scroll, la cabecera gana una sombra propia (deja de "flotar"). */
  readonly isHeaderElevated = signal(false);
  readonly currentYear = new Date().getFullYear();

  readonly deliveryFee = DELIVERY_FEE_IN_SOLES;
  readonly categories = signal<Category[]>([]);
  /** Una categoría solo se marca activa si coincide también el ?categoria= de la URL. */
  readonly exactCatalogMatch: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'exact',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  readonly isCustomer = computed(() => this.currentSession()?.role === 'customer');
  readonly isStaffMember = this.authService.isStaffMember;
  readonly staffPanelRoute = computed(() => {
    const session = this.currentSession();
    return session ? HOME_ROUTE_BY_ROLE[session.role] : '/';
  });
  readonly currentRoleName = computed(() => {
    const session = this.currentSession();
    return session ? ROLE_DISPLAY_NAME[session.role] : '';
  });
  readonly shouldShowEmailVerificationNotice = computed(() => {
    const session = this.currentSession();
    return session?.role === 'customer' && !session.isEmailVerified;
  });
  readonly verificationNoticeMessage = signal('');

  async ngOnInit(): Promise<void> {
    try {
      this.categories.set(await this.categoryRepository.findActiveCategories());
    } catch (error) {
      // Sin categorías la tienda sigue funcionando: solo queda el enlace al catálogo completo.
      this.logger.logError('PublicLayout.loadCategories', error);
    }
  }

  /** El buscador de la cabecera lleva al catálogo con el texto como ?buscar=. */
  searchProducts(submitEvent: Event, searchText: string): void {
    submitEvent.preventDefault();
    const trimmedSearch = searchText.trim();
    this.closeMobileMenu();
    void this.router.navigate(['/catalogo'], {
      queryParams: trimmedSearch ? { buscar: trimmedSearch } : {},
    });
  }

  onWindowScroll(): void {
    this.isHeaderElevated.set(window.scrollY > 12);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((isOpen) => !isOpen);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
    this.isUserMenuOpen.set(false);
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen.update((isOpen) => !isOpen);
  }

  async resendVerificationEmail(): Promise<void> {
    await this.authService.resendEmailVerification();
    this.verificationNoticeMessage.set('Te enviamos un nuevo correo de verificación.');
  }

  async confirmEmailWasVerified(): Promise<void> {
    const refreshedSession = await this.authService.refreshSession();
    if (!refreshedSession?.isEmailVerified) {
      this.verificationNoticeMessage.set('Aún no vemos tu correo verificado. Revisa tu bandeja.');
    }
  }

  async signOut(): Promise<void> {
    this.closeMobileMenu();
    await this.authService.signOutCurrentUser();
    await this.router.navigateByUrl('/');
  }
}
