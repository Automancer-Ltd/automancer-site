/**
 * The Copy button beside each endpoint's command on /developers/ (t25710). The buttons ship
 * hidden, so a browser without the Clipboard API (or without this script) shows none. When the
 * browser refuses the write, the command is selected instead for the visitor to copy, and the
 * page's status line says which happened.
 */
const status = document.getElementById('copy-status');
if (status && navigator.clipboard) {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.ep__copy')) {
    const code = button.previousElementSibling!;
    const label = button.firstChild!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.hidden = false;
    button.addEventListener('click', () => {
      status.textContent = '';
      navigator.clipboard.writeText(code.textContent ?? '').then(
        () => {
          label.nodeValue = 'Copied';
          button.dataset.done = '';
          status.textContent = 'Command copied.';
          clearTimeout(timer);
          timer = setTimeout(() => {
            label.nodeValue = 'Copy';
            delete button.dataset.done;
          }, 2000);
        },
        () => {
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          status.textContent = 'Command selected. Copy it with your keyboard.';
        },
      );
    });
  }
}

export {};
