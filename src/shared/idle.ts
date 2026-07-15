/** Fires onIdle after `ms` without pointer/key activity; onActive on any activity. */
export class IdleWatcher {
  private timer: number | undefined;
  private idle = false;

  constructor(
    private ms: number,
    private onIdle: () => void,
    private onActive: () => void,
  ) {}

  private reset = () => {
    if (this.idle) {
      this.idle = false;
      this.onActive();
    }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.idle = true;
      this.onIdle();
    }, this.ms);
  };

  attach() {
    addEventListener('pointermove', this.reset, { passive: true });
    addEventListener('pointerdown', this.reset, { passive: true });
    addEventListener('keydown', this.reset);
    this.reset();
  }

  detach() {
    removeEventListener('pointermove', this.reset);
    removeEventListener('pointerdown', this.reset);
    removeEventListener('keydown', this.reset);
    clearTimeout(this.timer);
  }
}
