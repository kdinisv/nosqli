export type DebugEvent = {
  ts: number;
  category: string; // e.g., 'fetch','inject','evidence','crawler'
  message: string;
  data?: any;
};

export type DebugSink = (e: DebugEvent) => void;

export class DebugLogger {
  private enabled: boolean;
  private sink?: DebugSink;

  constructor(enabled: boolean, sink?: DebugSink) {
    this.enabled = !!enabled;
    this.sink = sink;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(v: boolean) {
    this.enabled = !!v;
  }

  setSink(sink?: DebugSink) {
    this.sink = sink;
  }

  emit(category: string, message: string, data?: any) {
    if (!this.enabled) return;
    const evt: DebugEvent = { ts: Date.now(), category, message, data };
    try {
      this.sink?.(evt);
    } catch {}
    if (!this.sink || process.env.NOSQLI_DEBUG_STDERR === "1") {
      try {
        // eslint-disable-next-line no-console
        console.error(`[DBG] ${category} ${message}`);
      } catch {}
    }
  }
}
