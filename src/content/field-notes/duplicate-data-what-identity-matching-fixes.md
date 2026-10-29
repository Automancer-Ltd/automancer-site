---
title: "Duplicate data, orphan records: what identity matching actually fixes"
description: "Identity matching uses comparison rules and a human review queue to merge duplicate records safely. On a live care migration it matched 274 of 418 candidates automatically."
date: 2026-09-21
sector: "General"
category: "Data migration"
tags: ["identity-matching", "data-migration", "deduplication", "data-quality", "erp"]
draft: false
author: "Waseem Ilyas"
---

Two systems hold the same person under three slightly different spellings, with no shared ID linking them. Duplicate records are one of the most common problems in small-business software, and they undermine every report built on top of them.

## What identity matching does

Identity matching checks, record by record, whether two entries in different systems belong to the same person. It uses clear comparison rules — plus a human review queue for the cases where the data is too thin or contradictory to be certain.

The rules compare whatever fields your records hold: name variants, date of birth, postcode, role, branch, staff number, National Insurance number, and start date. None of those fields is proof on its own. Together, they show whether two rows describe one person.

When the fields agree strongly, the system links the records automatically. When they conflict or key details are missing, the system sends the pair to a staff member to decide. Merging two different people into one record is far worse than asking a human to check a borderline match.

## Why a straight CSV import creates a mess

Importing a spreadsheet straight into a new system copies every duplicate and broken link into the new database. Two failures always follow:

- **Duplicate records.** One system has "Kathryn O'Neill" and another has "Katherine O Neill". Both rows stay active. Six months later, half of her training sits on one record and half of her shifts sit on the other.
- **Orphan records.** A visit or training certificate points to an old ID that no longer exists. Orphan records rarely show up in a staff list; they show up months later as a report total that does not add up.

## Results from a live migration

During a live migration for [a ~600-person supported-living care provider](/work/care-provider-transformation/), our matching rules resolved **274 of 418** possible duplicates automatically. The same import created **294 carers and 293 service users** as clean records from the client's CSV exports.

Staff only had to review the 144 genuinely ambiguous records instead of checking all 418 by hand.

We then checked the platform's reports against the client's real exports — 500 visits, 175 medication alerts, and 416 names routed to review — before anyone relied on the new figures.

## Where this shows up outside social care

The same problem appears whenever two business tools hold separate lists of the same people or products:

- A CRM and an accounting system that spell customer names differently, skewing revenue reports.
- A stock list and an order system that drifted apart after someone edited product codes.
- A rota and a payroll spreadsheet that disagree on who worked Tuesday.
- A pricing workbook where one product code means two different items on different tabs.
