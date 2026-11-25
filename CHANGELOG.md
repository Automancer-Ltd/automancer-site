# Release notes

## v2026.11.25.5 — 25 November 2026

The full enquiry form comes into view sooner when you visit the contact page.


## v2026.11.25.4 — 25 November 2026

Visitors now see pages from the newest release, even when a nearby copy is out of date.


## v2026.11.25.3 — 25 November 2026

Visitors opening a recently cached page can still use its page features while a new release is deployed.


## v2026.11.25.2 — 25 November 2026

Pages load 30% less JavaScript, with the scripts combined into one file. Returning visitors also avoid downloading the old separate script again.


## v2026.11.25.1 — 25 November 2026

The site now uses a shared compression dictionary to make page delivery more efficient and explain that approach to visitors.

### Improvements

- Pages use less data for browsers that already have the site's shared compression dictionary.
- The privacy notice explains how the shared compression dictionary is used.
- The site's deployment and performance documentation explains the dictionary, its deployment order, and measured results.

### Privacy

- When something goes wrong on the site, error reports include fewer details about your browser.


## v2026.11.24.6 — 24 November 2026

The service price comparison fits on the first phone screen.

### Improvements

- Revealing page content appears from the first screen, including service prices and case study figures.
- When a reveal ends, its content no longer stays held in place.


## v2026.11.24.5 — 24 November 2026

The home page makes its proof and service information easier to scan on phones.

### Fixes

- Contact forms now show a clear message when an enquiry is too long or cannot be sent.
- Browser error reports have sensitive details removed before they are sent.

### More reliable releases

- Published service information now includes the pages listed in the sitemap.
- Each release is checked against the service details and page addresses already published, helping keep links and integrations that rely on them working.


## v2026.11.24.4 — 24 November 2026

Pages now arrive faster, and the developer reference is easier to use on a phone.

### Improvements

- Pages load from a nearby data centre, with refreshed content following each visit.
- Long paths and field names fit on the Developers page at 200% text size on a 390px screen.
- Each Developers endpoint shows its full command, a Copy button and the response fields it returns.
- Pages load from the latest released version, and visits are checked against that release.
- The site reports which edge version is serving your visit.


## v2026.11.24.2 — 24 November 2026

The site is easier to follow on phones, and reported errors are sent in a single bounded report.

### Improvements

- On phones and tablets, a bar under the navigation shows which section of a field note, case study or release note you’re reading and its place in the article. Open the contents list over the text, jump to a section, and the list closes; headings land below the bar.
- When a site error is reported, it is sent as one bounded report.


## v2026.11.24.1 — 24 November 2026

The Work page brings case studies into clearer view, and Field Notes is easier to browse on phones.

### Improvements

- Field Notes opens on its newest note, with a shorter introduction and subject filters in one row on phones.
- Case studies are easier to find from the Work page.
- Contact details load once and are reused across service offers.
- The site now filters out error reports from its own scripts when they have no frame.
- Site responses to requests for part of a page include the complete HTML.
- Figures in case studies link to their supporting evidence.

### Internal


## v2026.11.23.1 — 23 November 2026

This release makes it easier to get in touch and receive text versions of site pages.

### Improvements

- Email and voicemail options now appear on the first Contact screen, so visitors can choose how to get in touch straight away.
- When you request a page’s Markdown version, the site rechecks it and sends it in compressed form.


## v2026.11.22.4 — 22 November 2026

This release makes the site more considerate of visitors’ privacy and improves how its pages are delivered.

### Improvements

- Error reports pass through the Automancer website, so the reporting service does not receive visitors’ IP addresses, languages or page referrers.
- Browsers that support Brotli receive pre-compressed copies of the site’s text files.

### Fixes

- Visitors using browsers or tools that request gzip only receive a smaller home page instead of an oversized Brotli version.
- Brotli copies of HTML pages are delivered without being compressed again at the edge.


## v2026.11.22.3 — 22 November 2026

The enquiry form is quicker to start and easier to complete.

### Contact form

- The essential enquiry fields appear first, so you can get started sooner.
- The security check loads when you use the form, during a pause in typing.


## v2026.11.22.2 — 22 November 2026

Phone visitors can now open links that have already been fetched while they were on screen, reducing the wait after a tap in Safari and Firefox.


## v2026.11.22.1 — 22 November 2026

The services page now works better on paper, and tablet visitors can read the About page without cramped text.

### Improvements

- Printing or saving the services page as a PDF shows the offers and prices, with clear black text and the page details.
- The About page’s rules stay in two readable columns on portrait tablets.


## v2026.11.21.6 — 21 November 2026

The site adds new reading material and more context to its text guides.

### New reading

- Read a new field note on how to tell practical AI products from hype before you buy.
- See case study citations in the site’s text guides.


## v2026.11.21.5 — 21 November 2026

The site now presents a clearer, more consistent experience across its domains.

### Improvements

- The Syne display font starts loading with the page response, helping the site show its intended typography sooner.
- Visiting automancer.co.uk or www.automancer.co.uk now takes you securely to the matching page on automancer.uk.
- The site’s security contact details can now be verified from both published security.txt addresses.


## v2026.11.21.4 — 21 November 2026

This release makes it easier for visitors to find their way around the site and explore its work.

### Improvements

- Visitors who reach a missing page can find recovery links on the first screen.
- Visitors can open sources for case study figures from the pages and field notes where those figures appear.
- Visitors can browse the release timeline by month or day and jump to an entry from its contents list. The footer links to the timeline.


## v2026.11.21.3 — 21 November 2026

The site now feels clearer and more consistent as visitors explore its services, figures and pages.

### Improvements

- Starting prices are now one scroll from the homepage introduction.
- Case study figures now link to the source line behind each number.
- Firefox and Safari show linked pages sooner after you hover over a link.
- Text moves less as web fonts load, including on Android.

### Fixes

- The GitHub Pages copy now sends visitors to automancer.uk.
- The www address now redirects to automancer.uk.


## v2026.11.21.2 — 21 November 2026

Starting an enquiry is simpler, whether you are exploring a service or browsing on your phone.

### Improvements

- Service buttons now open the enquiry form with that service selected. The form shows its starting price, and your choice is included in the message sent to Automancer. You can leave the business name blank.
- On mobile, Contact is visible in the header, with a compact menu for the other pages.
- Pages can begin displaying without waiting for a separate stylesheet request.


## v2026.11.21.1 — 21 November 2026

Visitors can now find the field notes that interest them more quickly.

### Field notes

- Filter field notes by subject and see how many notes each subject has. Each note’s subject links to its subject list.


## v2026.11.20.5 — 20 November 2026

The main pages get to their content sooner, and field notes are easier to explore.

### Improvements

- The home and developer pages show their main actions straight away.
- Pages load the styles they need, helping the first screen appear sooner on a fresh visit.
- Field notes show their opening paragraph sooner on laptops and suggest three more notes to read.

### Security

- Pages opened from automancer.uk cannot message or inspect the site through that window.
- XML, SVG and redirect pages apply additional browser security restrictions.


## v2026.11.20.4 — 20 November 2026

Home and services pages now show their published starting prices when shared.

### A smoother experience

The animated beads, home and developer page headlines, and service price underline move smoothly as you browse.


## v2026.11.20.3 — 20 November 2026

This release makes Automancer’s work easier to explore and share.

### Explore our work

- Case studies now have an “On this page” list beside the text on larger screens, and a closed contents list on smaller screens. It highlights the section you’re reading.
- Field notes now have the same contents list, making it easier to find a section and see where you are.

### Share a page

- Each field note and case study now has its own share image, so previews show the page’s headline and details.

### Browsing and contact

- Pages now refuse injected scripts and unsafe HTML, helping protect visitors while they browse.
- If sending a contact enquiry fails, you can recover the enquiry instead of losing what you wrote.
- Legacy page redirects now keep the query string as you entered it.


## v2026.11.20.2 — 20 November 2026

Pages can now send data only to this site and its error reporter, with the contact page also able to submit enquiries.


## v2026.11.20.1 — 20 November 2026

The mobile layout is easier to read, with clearer spacing and less crowded text.

### Improvements

- On phones, the home page price ladder shows its steps in order, and case-study labels and figures fit more clearly.
- Text stays on screen across the site at narrow widths and when enlarged to twice its normal size.


## v2026.11.19.2 — 19 November 2026

A new field note helps prospective clients consider whether a workflow sprint or a custom build fits their needs.


## v2026.11.12.4 — 12 November 2026

This release makes the site’s information easier to find and read.

### Finding information

- Search listings can use the date each page’s wording last changed, rather than the date of every deployment.

### Readability and contact

- Headings and prices remain readable when you enlarge text.
- The enquiry form starts on the first screen on phones and desktops, and the menu stays reachable without sideways scrolling on phones at twice the normal text size.


## v2026.11.12.3 — 12 November 2026

The enquiry page and site controls fit better on small screens, while page update dates follow changes to the words visitors see.

### Improvements

- The enquiry form is visible sooner on phones and desktop, so visitors can start their enquiry without scrolling as far.
- The menu stays within reach on phones when text is enlarged to twice its normal size, and contact details and legal links wrap without sideways scrolling.
- Headings and prices remain readable with enlarged text.

### Page information

- Page update dates reflect when the words on each page last changed, giving visitors and search tools a more useful indication of freshness.


## v2026.11.12.2 — 12 November 2026

Pricing on the services page is clearer and easier to read.

### Services

- Service prices are easier to read when you enlarge text.
- You can see which services are priced on arrival and follow a link for offer details.


## v2026.11.12.1 — 12 November 2026

The enquiry form and its agent guidance now share one source, so visitors and automated agents get consistent information about how to contact Automancer.


## v2026.11.01.3 — 1 November 2026

A new field note on supplier restore evidence is now available to read.


## v2026.11.01.2 — 1 November 2026

The site responds more consistently, and the new field note is ready for a future release.

### Improvements

- Every site response, including error pages and redirects, now includes security headers.

### Coming soon

- A field note on checking a supplier’s restore evidence is in preparation and is not published on the site yet.

### Behind the scenes

- Internal plumbing maintenance; no user-facing behaviour changed. <!-- commits: 2 -->
## v2026.10.30.1 — 30 October 2026

Outlined numerals on the home and services pages now display without stray inner lines.


## v2026.10.29.1 — 29 October 2026

The public website now explains what Automancer does in clearer, simpler language.


## v2026.10.23.5 — 23 October 2026

The services page now lists what each service includes, so visitors can see its scope alongside the starting price.


## v2026.10.23.4 — 23 October 2026

The contact form’s security check now runs from Automancer’s own Cloudflare account. Sending an enquiry works the same way as before.


## v2026.10.23.1 — 23 October 2026

The website’s presentation is more consistent across pages and screen sizes.

### Improvements

- The Developers page now shows its heading before the action buttons, with more space between section headings and lists.
- Section labels, story text, and feature rows now align and read more clearly.
- The home page’s work cards sit in a balanced two-column layout.
- On phones, the hero clears the navigation and the scroll cue no longer overlaps the action buttons.
- Text wraps more cleanly, and sections on the same background have more even spacing.


## v2026.10.22.8 — 22 October 2026

When a message is too long, the contact form now explains that the limit covers the message, team size and extra boxes together, so you know what to shorten. The Developers page’s note on the agent manifest is also shorter.


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
