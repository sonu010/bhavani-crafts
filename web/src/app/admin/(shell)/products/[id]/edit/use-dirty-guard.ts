"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Dirty-state guard for the product editor.
 *
 * Child tabs call `markDirty()` when the user edits a field. The hook:
 *   - Sets `window.onbeforeunload` so a full-page reload / close prompts
 *     the user.
 *   - Exposes `isDirty` so the page can paint a "Unsaved changes" hint
 *     and disable the breadcrumb back-link or wrap it in a confirm.
 *
 * Client-side tab switches are NOT intercepted: the editor's per-tab
 * save-on-blur model (lands in T11+) means a switched-away-from tab is
 * already persisted by the time the tab content unmounts.
 *
 * Sidebar navigation away (Linear-style "go to a different admin
 * section") IS prompted via the AlertDialog the layout owns; that wiring
 * also lands in T11 when the auto-save semantics are in place.
 */
export function useDirtyGuard() {
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const markClean = useCallback(() => setIsDirty(false), []);

  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      // Chromium honors preventDefault + setting returnValue. Firefox /
      // Safari ignore the custom string and use their built-in copy.
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { isDirty, markDirty, markClean };
}
