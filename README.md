# Automancer Site

Public site for [automancer.uk](https://automancer.uk): a static Astro build with case studies and
field notes as content collections, self-hosted fonts, and no advertising or analytics cookies
(Cloudflare Turnstile may set a strictly necessary anti-abuse cookie on the contact form).

```sh
pnpm install
pnpm run dev       # local dev server
pnpm run verify    # lint, typecheck, build and audit dist/ — what CI runs
```

A merge to `main` deploys to GitHub Pages. Working on it: [`AGENTS.md`](AGENTS.md).
