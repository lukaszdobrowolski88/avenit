import React, { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import {
  insertElement, updateElement, removeElement, duplicateElementInTree,
  findElement, locateElement,
} from './builderElements';

const HISTORY_LIMIT = 50;
const BuilderContext = createContext(null);

// state: { past[], present(root[]), future[], selectedId, settings, dirty }
function withHistory(state, nextRoot, extra = {}) {
  return {
    ...state,
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: nextRoot,
    future: [],
    dirty: true,
    ...extra,
  };
}

// Przenieś element `id` przed `beforeId` (lub na koniec kontenera parentId).
function moveInTree(root, id, parentId, beforeId) {
  const el = findElement(root, id);
  if (!el) return root;
  if (beforeId === id) return root;
  const without = removeElement(root, id);
  if (beforeId) {
    const loc = locateElement(without, beforeId);
    if (loc) return insertElement(without, el, { parentId: loc.parentId, index: loc.index });
  }
  return insertElement(without, el, { parentId: parentId ?? null });
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROOT':
      return withHistory(state, action.root, { selectedId: null });
    case 'ADD':
      return withHistory(state, insertElement(state.present, action.element, action.target || {}), { selectedId: action.element.id });
    case 'UPDATE':
      return withHistory(state, updateElement(state.present, action.id, action.patch));
    case 'REMOVE':
      return withHistory(state, removeElement(state.present, action.id), {
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      });
    case 'DUPLICATE':
      return withHistory(state, duplicateElementInTree(state.present, action.id));
    case 'MOVE':
      return withHistory(state, moveInTree(state.present, action.id, action.parentId, action.beforeId));
    case 'SELECT':
      return { ...state, selectedId: action.id };
    case 'UNDO': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        dirty: true,
      };
    }
    case 'REDO': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        dirty: true,
      };
    }
    case 'MARK_CLEAN':
      return { ...state, dirty: false };
    default:
      return state;
  }
}

export function BuilderProvider({ initialLayout, children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: initialLayout?.root || [],
    future: [],
    selectedId: null,
    settings: initialLayout?.settings || {},
    dirty: false,
  }));

  const api = useMemo(() => ({
    root: state.present,
    selectedId: state.selectedId,
    settings: state.settings,
    dirty: state.dirty,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    selected: state.selectedId ? findElement(state.present, state.selectedId) : null,
    dispatch,
  }), [state]);

  return <BuilderContext.Provider value={api}>{children}</BuilderContext.Provider>;
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder poza BuilderProvider');
  return ctx;
}

// Wygodne akcje.
export function useBuilderActions() {
  const { dispatch } = useBuilder();
  return {
    add: useCallback((element, target) => dispatch({ type: 'ADD', element, target }), [dispatch]),
    update: useCallback((id, patch) => dispatch({ type: 'UPDATE', id, patch }), [dispatch]),
    remove: useCallback((id) => dispatch({ type: 'REMOVE', id }), [dispatch]),
    duplicate: useCallback((id) => dispatch({ type: 'DUPLICATE', id }), [dispatch]),
    move: useCallback((id, parentId, beforeId) => dispatch({ type: 'MOVE', id, parentId, beforeId }), [dispatch]),
    select: useCallback((id) => dispatch({ type: 'SELECT', id }), [dispatch]),
    setRoot: useCallback((root) => dispatch({ type: 'SET_ROOT', root }), [dispatch]),
    undo: useCallback(() => dispatch({ type: 'UNDO' }), [dispatch]),
    redo: useCallback(() => dispatch({ type: 'REDO' }), [dispatch]),
    markClean: useCallback(() => dispatch({ type: 'MARK_CLEAN' }), [dispatch]),
  };
}
