import { describe, expect, it } from 'vitest';
import { runPage } from './support/storage-sentinel';

describe('storage sentinel bypass resistance', () => {
  it('records a Storage-prototype call that bypasses an instance property', () => {
    const result = runPage(`
      <script>
        Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(window.localStorage),
          'setItem'
        ).value.call(window.localStorage, 'bypass', '1');
      </script>
    `);

    expect(result.errors).toEqual([]);
    expect(result.touches).toContain('localStorage.setItem(bypass, 1)');
  });

  it('records storage reached through a fresh same-origin iframe', () => {
    // happy-dom 21 only gives a frame a `contentWindow` once the frame carries a
    // document of its own, so the frame is given an empty same-origin `srcdoc`.
    // An empty about:blank frame stays null there until an asynchronous
    // navigation finishes, which a page script cannot wait for. The bypass under
    // test is unchanged: storage is reached through `contentWindow`.
    const result = runPage(`
      <script>
        const frame = document.createElement('iframe');
        frame.srcdoc = '';
        document.body.append(frame);
        frame.contentWindow.localStorage.setItem('iframe-bypass', '1');
      </script>
    `);

    expect(result.errors).toEqual([]);
    expect(result.touches).toContainEqual(expect.stringMatching(/\.setItem\(iframe-bypass, 1\)$/));
  });
});
