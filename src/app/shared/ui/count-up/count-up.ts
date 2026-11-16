import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  effect,
  inject,
  input,
} from '@angular/core';

/**
 * Anima una cifra desde su valor actual hasta el objetivo cuando entra en
 * pantalla (una sola vez). Con `prefers-reduced-motion` se muestra el valor
 * final de inmediato. El `<span>` debe llevar la clase `is-tabular`.
 */
@Directive({
  selector: '[countUp]',
})
export class CountUp implements OnInit, OnDestroy {
  /** Valor final al que llega la cifra. */
  readonly countUp = input.required<number>();
  /** Duración de la animación en ms. */
  readonly countUpDuration = input(1100);

  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;
  private animationFrame = 0;
  private displayedValue = 0;
  private isVisible = false;

  constructor() {
    effect(() => {
      if (this.isVisible) {
        this.render(this.countUp());
      }
    });
  }

  ngOnInit(): void {
    const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion) {
      this.isVisible = true;
      this.render(this.countUp());
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.isVisible = true;
            this.render(this.countUp());
            this.observer?.disconnect();
            this.observer = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    this.observer.observe(this.hostElement.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.animationFrame);
  }

  private render(targetValue: number): void {
    cancelAnimationFrame(this.animationFrame);
    const element = this.hostElement.nativeElement;

    if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.displayedValue = targetValue;
      element.textContent = String(targetValue);
      return;
    }

    const startValue = this.displayedValue;
    const duration = this.countUpDuration();
    const startTime = performance.now();

    const tick = (now: number): void => {
      const progress = Math.min((now - startTime) / duration, 1);
      const easedValue = 1 - Math.pow(2, -10 * progress); // easeOutExpo
      this.displayedValue = Math.round(startValue + (targetValue - startValue) * easedValue);
      element.textContent = String(this.displayedValue);
      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(tick);
      } else {
        this.displayedValue = targetValue;
        element.textContent = String(targetValue);
      }
    };

    this.animationFrame = requestAnimationFrame(tick);
  }
}
