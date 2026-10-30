import { Playables } from '../sdk/playables';

/**
 * Versioned JSON save data on top of Playables.loadData/saveData.
 *
 *   const save = new SaveStore(() => ({ level: 1 }), 1);
 *   await save.load();          // must happen before any save
 *   save.data.level = 2;
 *   save.save();                // debounced
 *   await save.flush();         // immediate (use on pause / level complete)
 *
 * Older saves are merged over defaults, so adding fields is always safe.
 * Bump `version` and pass `migrate` when you rename or restructure fields.
 */
export class SaveStore<T extends object> {
  data: T;
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly defaults: () => T,
    private readonly version: number,
    private readonly migrate?: (old: unknown, fromVersion: number) => Partial<T>,
  ) {
    this.data = defaults();
  }

  async load(): Promise<T> {
    const raw = await Playables.loadData();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { v?: number; d?: unknown };
        const v = typeof parsed.v === 'number' ? parsed.v : 0;
        const body =
          v === this.version || !this.migrate ? (parsed.d as Partial<T>) : this.migrate(parsed.d, v);
        this.data = { ...this.defaults(), ...(body ?? {}) };
      } catch (e) {
        console.warn('[save] corrupt save, using defaults', e);
        Playables.logWarning();
      }
    }
    this.loaded = true;
    return this.data;
  }

  save(debounceMs = 400): void {
    if (!this.loaded) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), debounceMs);
  }

  async flush(): Promise<void> {
    if (!this.loaded) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await Playables.saveData(JSON.stringify({ v: this.version, d: this.data }));
  }
}
