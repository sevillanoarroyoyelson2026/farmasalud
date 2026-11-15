import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_DISPLAY_NAME } from '../../../core/auth/user-role';

export interface PanelNavigationItem {
  iconClass: string;
  label: string;
  path: string;
}

export interface PanelNavigationSection {
  sectionTitle: string;
  items: PanelNavigationItem[];
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'farmasalud.panelSidebarCollapsed';

/**
 * Estructura común de los paneles internos (admin y trabajador), tomada del
 * admin-layout de Alliker: sidebar colapsable en escritorio, barra inferior en
 * móvil y hoja "Más" con el resto de opciones.
 * Cada layout solo le pasa su menú y proyecta sus controles propios en el header.
 */
@Component({
  selector: 'app-panel-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './panel-shell.html',
  styleUrl: './panel-shell.css',
})
export class PanelShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly panelTitle = input.required<string>();
  readonly navigationSections = input.required<PanelNavigationSection[]>();
  /** Accesos que se muestran en la barra inferior del móvil (máximo 4). */
  readonly mobileQuickLinks = input.required<PanelNavigationItem[]>();

  readonly currentSession = this.authService.currentSession;
  readonly roleDisplayName = ROLE_DISPLAY_NAME;
  readonly isSidebarCollapsed = signal(this.readSidebarPreference());
  readonly isMobileMoreSheetOpen = signal(false);

  toggleSidebar(): void {
    this.isSidebarCollapsed.update((isCollapsed) => !isCollapsed);
    this.saveSidebarPreference(this.isSidebarCollapsed());
  }

  toggleMobileMoreSheet(): void {
    this.isMobileMoreSheetOpen.update((isOpen) => !isOpen);
  }

  closeMobileMoreSheet(): void {
    this.isMobileMoreSheetOpen.set(false);
  }

  async goToStore(): Promise<void> {
    await this.router.navigateByUrl('/');
  }

  async signOut(): Promise<void> {
    await this.authService.signOutCurrentUser();
    await this.router.navigateByUrl('/login');
  }

  /** La preferencia visual del sidebar es lo único que se guarda en localStorage. */
  private readSidebarPreference(): boolean {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private saveSidebarPreference(isCollapsed: boolean): void {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
    } catch {
      // Navegación privada sin almacenamiento: la preferencia simplemente no se recuerda.
    }
  }
}
