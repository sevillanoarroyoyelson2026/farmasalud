import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HOME_ROUTE_BY_ROLE, ROLE_DISPLAY_NAME } from '../../core/auth/user-role';
import { CartService } from '../../shared/data-access/cart.service';
import { CartNoticeComponent } from '../../shared/ui/cart-notice/cart-notice';

interface PublicNavigationLink {
  label: string;
  path: string;
  isExactMatch: boolean;
}

/** Layout de la tienda: navbar, aviso de correo sin verificar, contenido y pie de página. */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CartNoticeComponent],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.css',
  host: {'(window:scroll)': 'onWindowScroll()'},
})
export class PublicLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentSession = this.authService.currentSession;
  readonly cartUnits = inject(CartService).totalUnits;
  readonly isMobileMenuOpen = signal(false);
  readonly isUserMenuOpen = signal(false);
  /** Al hacer scroll, la cabecera gana una sombra propia (deja de "flotar"). */
  readonly isHeaderElevated = signal(false);
  readonly currentYear = new Date().getFullYear();

  readonly navigationLinks: PublicNavigationLink[] = [
    { label: 'Inicio', path: '/', isExactMatch: true },
    { label: 'Catálogo', path: '/catalogo', isExactMatch: false },
  ];

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
