"use client";

import { useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

/** Um quadro do Excalidraw. `initial` = { elements, appState, files } salvo no servidor. */
export default function ExcalidrawBoard({ initial, onSceneChange }) {
  const first = useRef(true);
  const hasView = initial?.appState?.scrollX !== undefined;
  return (
    <Excalidraw
      initialData={{
        elements: initial?.elements || [],
        appState: { ...(initial?.appState || {}), collaborators: new Map() },
        files: initial?.files || {},
        scrollToContent: !hasView && (initial?.elements?.length || 0) > 0,
      }}
      langCode="pt-BR"
      onChange={(elements, appState, files) => {
        // o primeiro onChange é a própria carga inicial: não conta como edição
        if (first.current) { first.current = false; return; }
        onSceneChange(elements, appState, files);
      }}
    />
  );
}
