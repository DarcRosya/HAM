export class ActionQueue {
  constructor({ onChange } = {}) {
    this._queue = [];
    this._processing = false;
    this._onChange = onChange;
    this._active = false;
    this._version = 0;
    this._current = null;
  }

  get size() {
    return this._queue.length;
  }

  get isActive() {
    return this._active;
  }

  add(action) {
    if (typeof action !== 'function') return Promise.resolve();

    return new Promise((resolve, reject) => {
      this._queue.push({ action, resolve, reject });
      this._drain();
    });
  }

  clear() {
    this._queue = [];
    this._version += 1;
    if (this._current) this._current.cancel();
    this._setActive(false);
  }

  _setActive(isActive) {
    if (this._active === isActive) return;
    this._active = isActive;
    if (this._onChange) this._onChange(isActive);
  }

  async _drain() {
    if (this._processing) return;

    this._processing = true;
    this._setActive(true);
    const runVersion = this._version;

    while (this._queue.length > 0 && runVersion === this._version) {
      const item = this._queue.shift();
      const context = this._createContext();
      this._current = context;

      try {
        await Promise.race([
          Promise.resolve().then(() => item.action(context)),
          context.cancelPromise,
        ]);
        item.resolve();
      } catch (error) {
        item.reject(error);
      } finally {
        this._current = null;
      }
    }

    this._processing = false;
    this._setActive(this._queue.length > 0);
  }

  _createContext() {
    const cancelHandlers = [];
    let cancelResolve = null;

    const cancelPromise = new Promise((resolve) => {
      cancelResolve = resolve;
    });

    const context = {
      cancelled: false,
      signal: {
        get aborted() {
          return context.cancelled;
        },
      },
      onCancel(handler) {
        if (typeof handler === 'function') cancelHandlers.push(handler);
      },
      cancel() {
        if (context.cancelled) return;
        context.cancelled = true;
        cancelHandlers.forEach((handler) => handler());
        if (cancelResolve) cancelResolve();
      },
      cancelPromise,
    };

    return context;
  }
}
