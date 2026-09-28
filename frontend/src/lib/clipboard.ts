/**
 * Copy text to the clipboard, falling back for browsers that withhold the async
 * Clipboard API.
 *
 * `navigator.clipboard` only exists in a secure context, so it is undefined when
 * the app is opened over plain http on a LAN address — exactly how the office
 * reaches a staging build. Without the fallback the copy button would silently
 * do nothing there.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied permission or a non-focused document — try the legacy path below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Kept off-screen rather than hidden: `display:none` elements cannot be selected.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
