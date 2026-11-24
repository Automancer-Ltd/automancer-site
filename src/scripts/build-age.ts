/**
 * The footer's proof strip (ProofStrip.astro) prints when this build was deployed. This turns
 * that stamp into an honest relative age ("deployed 3h ago"), keeps the absolute stamp as its
 * title, and updates it while the page is open.
 */
const live = document.querySelectorAll<HTMLElement>('[data-build-since]');
const first = live[0];
const since = first ? new Date(first.dataset.buildSince ?? '').getTime() : NaN;

/** A whole number of seconds, minutes, hours or days ago, never in the future. */
function ageLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

if (first && !Number.isNaN(since)) {
  const stamp = first.textContent ?? '';
  const tick = () => {
    for (const el of live) {
      el.title = stamp;
      el.textContent = ageLabel(Date.now() - since);
    }
  };
  tick();
  setInterval(tick, 15_000);
}

export {};
