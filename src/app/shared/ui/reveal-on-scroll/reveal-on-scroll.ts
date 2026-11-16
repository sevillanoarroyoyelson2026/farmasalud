import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Revela el elemento al entrar en pantalla (una sola vez).
 * El movimiento vive en `styles.css` (`.reveal-on-scroll`); si el visitante
 * prefiere menos movimiento o el navegador no soporta IntersectionObserver,
 * el elemento aparece sin animación.
 */
@Directive({
  selector: '[revealOnScroll]',
})
export class RevealOnScroll implements OnInit, OnDestroy {
  /** Retardo en ms para escalonar elementos que entran juntos. */
  readonly revealDelay = input(0);

  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    const element = this.hostElement.nativeElement;
    element.classList.add('reveal-on-scroll');
    element.style.setProperty('--reveal-delay', `${this.revealDelay()}ms`);

    if (
      typeof IntersectionObserver === 'undefined' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      element.classList.add('is-revealed');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.classList.add('is-revealed');
            this.observer?.disconnect();
            this.observer = null;
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
