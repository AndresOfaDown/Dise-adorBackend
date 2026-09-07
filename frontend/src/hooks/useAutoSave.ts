import { useEffect, useRef } from 'react';
import { useDiagramStore } from '../store/diagramStore';

/**
 * Hook de Auto-Guardado Inteligente para el Editor UML.
 * Detecta cambios en clases, notas de texto, relaciones y nombre del proyecto
 * y los guarda automáticamente tras un intervalo debounce sin bloquear la UI.
 */
export const useAutoSave = (debounceMs: number = 1500) => {
  const {
    projectId,
    projectName,
    nodes,
    edges,
    isLoading,
    lastSaved,
    setHasUnsavedChanges,
    saveCurrentDiagram,
  } = useDiagramStore();

  const lastSavedFingerprint = useRef<string>('');
  const isLoadedRef = useRef<boolean>(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getFingerprint = () => {
    return JSON.stringify({
      projectName: projectName || '',
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: Math.round(n.position?.x ?? 0),
        y: Math.round(n.position?.y ?? 0),
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        data: e.data,
      })),
    });
  };

  // Establecer huella inicial tras carga
  useEffect(() => {
    if (!isLoading && projectId) {
      lastSavedFingerprint.current = getFingerprint();
      isLoadedRef.current = true;
      setHasUnsavedChanges(false);
    }
  }, [isLoading, projectId]);

  // Actualizar huella tras guardado manual o exitoso
  useEffect(() => {
    if (lastSaved && isLoadedRef.current) {
      lastSavedFingerprint.current = getFingerprint();
    }
  }, [lastSaved]);

  // Detector de cambios y auto-guardado debounced
  useEffect(() => {
    if (isLoading || !isLoadedRef.current || !projectId) {
      return;
    }

    const currentFingerprint = getFingerprint();

    // Si coincide con lo último guardado, no hay cambios pendientes
    if (currentFingerprint === lastSavedFingerprint.current) {
      setHasUnsavedChanges(false);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      return;
    }

    // Hay cambios pendientes de guardar
    setHasUnsavedChanges(true);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      // Evitar sobreescritura si ya se está guardando manualmente
      const storeState = useDiagramStore.getState();
      if (storeState.isSaving) return;

      try {
        await saveCurrentDiagram(true);
        lastSavedFingerprint.current = currentFingerprint;
      } catch (err) {
        console.error('Error en autoguardado:', err);
      }
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [nodes, edges, projectName, isLoading, projectId, debounceMs]);
};
