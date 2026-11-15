"use client";

import { useEffect } from "react";

// A link to a folded section opens it. Browsers scroll to a closed <details> but do not open it.
export function OpenOnHash() {
  useEffect(() => {
    function open() {
      if (!location.hash) return;
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      const fold = target?.closest("details");
      if (fold && !fold.open) {
        fold.open = true;
        target?.scrollIntoView();
      }
    }
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
