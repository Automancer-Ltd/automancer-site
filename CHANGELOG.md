# Release notes

## v2026.10.29.1 — 29 October 2026

The public website now explains what Automancer does in clearer, simpler language.


## v2026.10.23.5 — 23 October 2026

The services page now lists what each service includes, so visitors can see its scope alongside the starting price.


## v2026.10.23.4 — 23 October 2026

> **Plain-English notes are not written yet.** The writer did not describe these changes.
> Below is the raw change list, grouped by area. Replace this section before
> showing it to a client.

### Contact

- lead-form Turnstile widget from the Automancer Cloudflare account (#131)


## v2026.10.23.1 — 23 October 2026

The website’s presentation is more consistent across pages and screen sizes.

### Improvements

- The Developers page now shows its heading before the action buttons, with more space between section headings and lists.
- Section labels, story text, and feature rows now align and read more clearly.
- The home page’s work cards sit in a balanced two-column layout.
- On phones, the hero clears the navigation and the scroll cue no longer overlaps the action buttons.
- Text wraps more cleanly, and sections on the same background have more even spacing.


## v2026.10.22.8 — 22 October 2026

> **Plain-English notes are not written yet.** The writer did not describe these changes.
> Below is the raw change list, grouped by area. Replace this section before
> showing it to a client.

### General

- Contact form: name the combined limit; developers page: drop hosting phrase (t7216)


## v2026.10.22.6 — 22 October 2026

The contact form respects reduced-motion preferences when it scrolls into view.


## v2026.10.22.5 — 22 October 2026

The mobile menu stays in view as you move through the page, so you can keep using it without losing your place.


## v2026.10.22.1 — 22 October 2026

When visitors or search tools open a legacy `.html` link, they go straight to its page.


## v2026.10.21.9 — 21 October 2026

Visitors can now read Automancer’s release history on the website, including a page for each release.


## v2026.10.21.8 — 21 October 2026

The website is easier for people and services to navigate, with clearer links to its information and more helpful responses when a page or API request cannot be found.

### Improvements

- Pages with a Markdown version now provide it to visitors and services that request it.
- Website pages link to the sitemap, AI guidance, API details, and the homepage’s Markdown version, making this information easier to discover.
- The homepage now shares the same structured service and pricing details as the Services page, helping services understand what Automancer offers.

### Fixes

- When a page or API request cannot be found, the site provides a helpful error response.
- The API reference now documents error responses for unavailable pages and server problems.
- The service directory now includes a link to every listed endpoint.
- The site’s service information now includes its version and website address.


## v2026.10.21.7 — 21 October 2026

People can now find Automancer’s security contact and service details at the standard web addresses.


## v2026.10.21.2 — 21 October 2026

You can navigate the mobile menu and hear the contact form confirmation using a keyboard or screen reader.


## v2026.10.21.1 — 21 October 2026

The site now makes prices and recovery links easier to see, and gives visitors clearer ways to contact Automancer.

### Improvements

- Prices on the services page and recovery links on the 404 page remain visible when scripts are unavailable.
- The mobile menu closes when a visitor widens the screen, and focus returns to the menu button.

### Contact

- If the contact form cannot load its security check, visitors see the email option. The form also starts disabled until it is ready, so enquiries are not silently lost when scripts are unavailable.
- Visitors can retry a failed enquiry without reusing the previous security check.
- Case study summaries display as plain text.


## v2026.10.20.1 — 20 October 2026

The site now publishes, as data, what a machine may rely on — and, just as plainly, what it may not.

### For agents and developers

- New **`/api/stability.json`**: the endpoint paths, operation ids, service ids and field names that are promised to stay stable, what may change without notice, how a breaking change is published, and how much notice a removal gets.
- It also says what the site does **not** promise: no `Deprecation` or `Sunset` response headers on a static host, no rate limit, no uptime SLA.

### Documentation

- `/developers` links the new policy, and its endpoint count now comes from the API registry instead of being typed by hand.
- `llms.txt`, `robots.txt`, `/api/index.json`, `/openapi.json` and `/agent.json` all advertise it, and the production checker verifies the served document every deploy and every 30 minutes.

## v2026.10.14.1 — 14 October 2026

A clearer, more consistent picture of Automancer’s services and pricing across the website and its published information.

### Services

- The service names on the home page, services page, and published service information now match.

### Pricing

- Published starting prices stay consistent across the website and service information.


## v2026.10.13.1 — 13 October 2026

If the contact form cannot load its security check, visitors can use the email option to get in touch.


## v2026.10.05.2 — 5 October 2026

A new guide helps businesses explore which routine tasks may be suitable for automation on a budget under £1,000.


## v2026.10.01.1 — 1 October 2026

This release makes key website information easier to read and helps visitors get a response if an enquiry connection stalls. It also adds a new article about why business systems can disagree.

### New article

- Read about why business systems can disagree and the problems that can cause.

### Improvements

- The footer tagline and step labels are easier to read against their backgrounds.
- Field note pages now provide a word count that matches the article.

### Fixes

- If an enquiry connection stalls, the form now stops waiting and shows a direct email option.


## v2026.09.21.1 — 21 September 2026

A new field note explains how identity matching helps reduce duplicate data and orphan records.


## v2026.09.15.1 — 15 September 2026

A new field note explains what governed AI means and why it matters.


## v2026.09.10.1 — 10 September 2026

This release makes Automancer’s public information clearer and more transparent.

### Clarity and transparency

- The site now explains that agents monitor software spend and prepare invoices, while Waseem approves and issues them. Bookkeeping remains manual.
- A new field note explains how AI agents make decisions.


## v2026.09.05.1 — 5 September 2026

This release includes a security improvement that supports a safe, dependable experience.


## v2026.08.31.1 — 31 August 2026

Agents reading the site now see the same one-week meeting promise that people already see: we promise a meeting within one week of first contact.


## v2026.08.30.1 — 30 August 2026

This release makes the site clearer and easier to use across key visitor journeys.

### Improvements

- Navigation links and controls are easier to tap on mobile devices.
- The site tagline is available to visitors using screen readers.
- The terms page displays its publication date.

### Fixes

- Text on the page-not-found screen is easier to read.
- Contact form errors bring the relevant field into view, so you can see what needs attention.


## v2026.08.29.1 — 29 August 2026

A new field note helps self-storage teams know what to check before choosing software.


## v2026.08.23.2 — 23 August 2026

Our privacy information now gives a clearer picture of how the website’s security check uses browser storage.

### Privacy

- The privacy notice now describes what the contact-page security check actually stores. We measured it: it sets no cookie, and instead saves one small value in your browser.
- It states that this storage sits under the security provider’s domain rather than Automancer’s, and why it needs no consent prompt.


## v2026.08.23.1 — 23 August 2026

This release makes privacy choices simpler and the site’s data handling easier to understand.

### Privacy and data handling

- The site no longer saves campaign details in your browser or sends them with contact enquiries.
- The privacy notice now explains the limited technical information used when a page error occurs, including that personal data settings are turned off.


## v2026.08.22.11 — 22 August 2026

Contact form errors are now clearer and more helpful for visitors.

### Improvements

- Visitors now see plain-English guidance when a contact form submission cannot be completed.
- Unexpected submission errors include a direct email option, so visitors can still get in touch.


## v2026.08.22.10 — 22 August 2026

The contact form now gives clearer explanations when a message cannot be sent, including when requests are temporarily limited.


## v2026.08.22.9 — 22 August 2026

Published updates now receive a more complete release check, so empty entries are caught before they appear on the website.


## v2026.08.22.8 — 22 August 2026

Service links keep the same published identity when service names change, so existing references continue to work.


## v2026.08.22.7 — 22 August 2026

If the security check fails twice, the contact form offers an email fallback so you can still send your enquiry.


## v2026.08.22.6 — 22 August 2026

This release makes Automancer’s public information easier for developers and AI tools to discover, understand, and use through clearer guidance and a dedicated developer area.


## v2026.08.22.5 — 22 August 2026

The website now presents its services and work more clearly, with improved readability, stronger visual hierarchy, and a smoother experience across desktop and mobile.


## v2026.08.22.4 — 22 August 2026

The website’s public information for automated services and security enquiries is now available at reliable addresses.


## v2026.08.22.3 — 22 August 2026

This release improves confidence that the public website remains available and secure after updates and between visits.

### Reliability

- The site is now checked after each update and on a regular schedule.
- These checks help us spot unavailable pages and secure-connection issues sooner.


## v2026.08.22.2 — 22 August 2026

Automancer’s public website now makes its service information and security contact details available to the tools and services that look for them.


## v2026.08.22.1 — 22 August 2026

This release makes the site easier to explore, recover from errors, and access in different reading tools.

### Improvements

- Site information is now available in a consistent text format, making it easier to read and reuse across different tools.

### Fixes

- The page-not-found screen now helps visitors get back on track. It links to every main section, recent field notes, case studies, and contact options.


## v2026.08.21.2 — 21 August 2026

Internal tooling only — nothing on the website changes for visitors.

- The script that regenerates the social-sharing preview image now refuses bad
  arguments before it does anything, so it can no longer overwrite the live
  image by mistake, and it always shuts the browser down afterwards even when a
  render fails. It had also stopped being runnable at all, and it pointed at a
  Chromium version that is no longer installed; both are fixed.
- Verified end to end: the script renders a real 1200x630 PNG, and the browser
  it starts is gone afterwards.


## v2026.08.21.1 — 21 August 2026

This release makes the website clearer to use, easier to discover, and more transparent about the business behind it.

### New content

- Added a practical guide to UK legal requirements for new business websites.

### Improvements

- Improved page headings and navigation for visitors using assistive technology.
- Search results now show clearer page descriptions and titles.
- The page shown for broken links now has a clear heading.
- Logos in the navigation and footer are identified more clearly for assistive technology.

### Compliance updates

- The privacy notice now explains how to complain directly to Automancer and confirms a 30-day acknowledgement.
- The footer now includes the company’s place of registration.


## v2026.08.18.1 — 18 August 2026

This release gives prospective clients a clearer, more grounded view of how we approach business website content.

### Improvements

- Trading-disclosure guidance now focuses on practical website content and clearly states that it is not legal advice.
- Our case study and website cost guidance now use precise wording without broad compliance claims or unsupported delivery claims.


## v2026.08.17.1 — 17 August 2026

This release adds a new field note on building trust through credit-hire website compliance.
