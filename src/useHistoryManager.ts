import { useCallback, useEffect, useReducer, useRef } from 'react';

export interface HistoryEntry<T> {
  state: T;
  label: string;
}

export interface HistoryStore<T> {
  past: HistoryEntry<T>[];
  present: HistoryEntry<T>;
  future: HistoryEntry<T>[];
  lastGroupKey: string | null;
  lastTimestamp: number;
}

export interface CommitOptions {
  label: string;
  /**
   * Optional grouping key. Rapid consecutive updates sharing the same groupKey
   * within the coalesce window merge into a single undo step instead of flooding history.
   */
  groupKey?: string;
}

export const MAX_HISTORY_ENTRIES = 100;
export const COALESCE_WINDOW_MS = 650;

export function createHistoryStore<T>(initialState: T, initialLabel = 'Initial state'): HistoryStore<T> {
  return {
    past: [],
    present: { state: initialState, label: initialLabel },
    future: [],
    lastGroupKey: null,
    lastTimestamp: 0,
  };
}

export function commitHistoryState<T>(
  store: HistoryStore<T>,
  nextState: T,
  options: CommitOptions,
  now = Date.now()
): HistoryStore<T> {
  if (Object.is(nextState, store.present.state)) {
    return store;
  }

  const canCoalesce =
    Boolean(options.groupKey) &&
    options.groupKey === store.lastGroupKey &&
    now - store.lastTimestamp <= COALESCE_WINDOW_MS &&
    store.past.length > 0;

  if (canCoalesce) {
    // Keep past unchanged so undo reverts back to before the coalesced burst began
    return {
      past: store.past,
      present: { state: nextState, label: options.label },
      future: [],
      lastGroupKey: options.groupKey ?? null,
      lastTimestamp: now,
    };
  }

  const nextPast = [...store.past, store.present];
  const boundedPast =
    nextPast.length > MAX_HISTORY_ENTRIES
      ? nextPast.slice(nextPast.length - MAX_HISTORY_ENTRIES)
      : nextPast;

  return {
    past: boundedPast,
    present: { state: nextState, label: options.label },
    future: [],
    lastGroupKey: options.groupKey ?? null,
    lastTimestamp: now,
  };
}

export function stepUndo<T>(store: HistoryStore<T>): HistoryStore<T> {
  if (store.past.length === 0) return store;
  const previous = store.past[store.past.length - 1];
  const nextPast = store.past.slice(0, -1);

  return {
    past: nextPast,
    present: previous,
    future: [store.present, ...store.future],
    lastGroupKey: null,
    lastTimestamp: 0,
  };
}

export function stepRedo<T>(store: HistoryStore<T>): HistoryStore<T> {
  if (store.future.length === 0) return store;
  const next = store.future[0];
  const nextFuture = store.future.slice(1);

  return {
    past: [...store.past, store.present],
    present: next,
    future: nextFuture,
    lastGroupKey: null,
    lastTimestamp: 0,
  };
}

type HistoryAction<T> =
  | {
      type: 'COMMIT';
      updater: T | ((prev: T) => T);
      options: CommitOptions;
      now: number;
    }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function historyReducer<T>(store: HistoryStore<T>, action: HistoryAction<T>): HistoryStore<T> {
  switch (action.type) {
    case 'COMMIT': {
      const nextState =
        typeof action.updater === 'function'
          ? (action.updater as (prev: T) => T)(store.present.state)
          : action.updater;
      return commitHistoryState(store, nextState, action.options, action.now);
    }
    case 'UNDO':
      return stepUndo(store);
    case 'REDO':
      return stepRedo(store);
    default:
      return store;
  }
}

export function useHistoryManager<T>(initialFactory: () => T) {
  const initialRef = useRef<HistoryStore<T> | null>(null);
  if (initialRef.current === null) {
    initialRef.current = createHistoryStore(initialFactory());
  }

  const [store, dispatch] = useReducer(historyReducer<T>, initialRef.current);

  const commit = useCallback((updater: T | ((prev: T) => T), options: CommitOptions) => {
    dispatch({
      type: 'COMMIT',
      updater,
      options,
      now: Date.now(),
    });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const canUndo = store.past.length > 0;
  const canRedo = store.future.length > 0;
  const undoLabel = canUndo ? store.present.label : null;
  const redoLabel = canRedo ? store.future[0].label : null;

  // Bind standard Ctrl/Cmd+Z and Ctrl+Y / Cmd+Shift+Z shortcuts outside modal dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target && target.closest('[role="dialog"]')) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
        }
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  return {
    state: store.present.state,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    historyLength: store.past.length,
    futureLength: store.future.length,
  };
}
