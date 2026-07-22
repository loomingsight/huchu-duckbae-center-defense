export class MobileInputGuard {
  private readonly root: HTMLElement;
  private readonly documentRef: Document;
  private readonly windowRef: Window | null;
  private destroyed = false;

  constructor(
    root: HTMLElement,
    documentRef: Document,
    private readonly clearInput: () => void,
  ) {
    this.root = root;
    this.documentRef = documentRef;
    this.windowRef = documentRef.defaultView ?? null;
    this.root.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.root.addEventListener('gesturestart', this.onGesture, { passive: false });
    this.root.addEventListener('gesturechange', this.onGesture, { passive: false });
    this.root.addEventListener('gestureend', this.onGesture, { passive: false });
    this.documentRef.addEventListener?.('visibilitychange', this.onVisibilityChange);
    this.windowRef?.addEventListener('blur', this.onLifecyclePause);
    this.windowRef?.addEventListener('pagehide', this.onLifecyclePause);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeEventListener('touchmove', this.onTouchMove);
    this.root.removeEventListener('gesturestart', this.onGesture);
    this.root.removeEventListener('gesturechange', this.onGesture);
    this.root.removeEventListener('gestureend', this.onGesture);
    this.documentRef.removeEventListener?.('visibilitychange', this.onVisibilityChange);
    this.windowRef?.removeEventListener('blur', this.onLifecyclePause);
    this.windowRef?.removeEventListener('pagehide', this.onLifecyclePause);
  }

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  private readonly onGesture = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.documentRef.hidden) this.clearInput();
  };

  private readonly onLifecyclePause = (): void => {
    this.clearInput();
  };
}
