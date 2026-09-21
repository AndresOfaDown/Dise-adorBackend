/**
 * Copia texto al portapapeles de forma 100% segura y compatible
 * Funciona tanto en contextos seguros (HTTPS / localhost) como en entornos HTTP (red local / IP).
 */
export function copyToClipboardRobust(text: string): Promise<boolean> {
  // 1. Intentar con Clipboard API moderna si está disponible y en contexto seguro
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  // 2. Fallback con textarea y execCommand para HTTP y navegadores antiguos
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Ocultar del layout visual pero mantener seleccionable
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (err) {
    console.error('Error al copiar al portapapeles con fallback:', err);
    return false;
  }
}
