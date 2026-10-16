/**
 * copy.ts — the Copy button on every `Command` block (DESIGN.md §5).
 * Writes the command (never the shell prompt) to the clipboard, falls back to a
 * hidden selection when the async Clipboard API is unavailable, flips the label
 * to "Copied" and announces it through the block's aria-live region.
 *
 * One delegated listener, so any number of blocks costs nothing extra.
 */

const RESET_AFTER = 2000;

/**
 * `document.execCommand` is deprecated, but it is the only fallback when the
 * async Clipboard API is missing (insecure context, denied permission, older
 * browsers). Reached through a widened type so the deprecation stays out of
 * `astro check` while the call site says plainly what it does.
 */
const execCommand = (
  document as unknown as { execCommand?: (command: string) => boolean }
).execCommand;

function legacyCopy(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.insetBlockStart = '-1000px';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, field.value.length);
  let ok = false;
  try {
    ok = execCommand?.call(document, 'copy') ?? false;
  } catch {
    ok = false;
  }
  document.body.removeChild(field);
  return ok;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied or insecure context: fall through to the selection fallback */
  }
  return legacyCopy(text);
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-copy]');
  if (!button) return;

  const code = button.dataset.copy ?? '';
  const idle = button.dataset.copyLabel ?? 'Copy';
  const done = button.dataset.copyDone ?? 'Copied';
  const status = button
    .closest('figure, [data-copy-scope]')
    ?.querySelector<HTMLElement>('[data-copy-status]');

  void copyText(code).then((ok) => {
    if (!ok) return;
    button.dataset.state = 'done';
    button.textContent = done;
    if (status) status.textContent = done;
    window.setTimeout(() => {
      delete button.dataset.state;
      button.textContent = idle;
      if (status) status.textContent = '';
    }, RESET_AFTER);
  });
});
