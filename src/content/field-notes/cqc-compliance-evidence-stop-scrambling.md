---
title: "CQC compliance evidence: how to stop scrambling before an inspection"
description: "How UK care providers stop scrambling before a CQC inspection: turn scattered training records and QA signals into one source of truth."
date: 2026-07-06
sector: "Social care / supported living"
category: "Social care"
tags: ["care-compliance", "cqc", "supported-living", "lms", "qa-dashboard"]
draft: false
author: "Waseem Ilyas"
---

Every care provider knows the feeling. An inspection is coming, and
someone loses three days pulling training certificates out of four
systems, chasing refresher dates, and rebuilding a picture the business
should have been able to show at any moment. That scramble is not a sign
your care is poor. It is a sign your evidence lives in too many places.

## The real problem is where your evidence lives, not whether you have it

If you are scrambling before a CQC inspection, the fix is not more effort
the week before. It is a single source of truth you can point an inspector
at on any ordinary Tuesday. Most providers already do the caring well.
What they struggle to do is produce the evidence quickly, because it is
spread across an outsourced training provider, a rota spreadsheet, an
incident log, and one manager's memory of who is overdue on their
moving-and-handling refresher.

That is not a failing on your part. It is what happens when a sector this
heavily regulated gets served by tools that were each built to do one
slice of the job and none of them built to talk to the others.

## What a single source of truth for training actually looks like

To prepare training records for a CQC inspection without the last-minute
panic, you need one system that tracks three states for every member of
staff automatically: what is mandatory, what is due for a refresher, and
what is overdue. Not a spreadsheet someone re-reads and colour-codes by
hand the week before, but a live record that already knows the answer.

Most off-the-shelf learning platforms do not do this natively. They will
host courses and mark completions, then leave the compliance question, the
"who is out of date, right now, and on what" question, back on your plate.

We built exactly this layer on a real project for a ~600-person
supported-living care provider. We replaced outsourced training and manual,
spreadsheet-based refresher-tracking with a self-hosted learning management
system, plus a custom compliance layer to track mandatory, refresher and
overdue training the off-the-shelf tool could not handle on its own. It was
seeded across all three of the provider's branches with courses loaded.
The point of that layer is simple: it turns scattered inspection evidence
into one place you can actually point an inspector at.

## What a QA oversight dashboard surfaces that a manual review can't

A quality dashboard earns its keep between inspections, not just before
them. Done properly, it stops being a report you assemble and becomes a
view that is already assembled, showing you the exceptions before a
regulator does.

On the same build, the QA and management oversight dashboard is live. It
pulls care-quality signals from multiple systems into one view: KPI cards,
branch comparisons, a support-worker priority watchlist, a repeat-concern
watchlist for service users, medication review, and a filterable review
queue. Instead of hunting through separate systems for the thing that
needs attention, a manager opens one screen and sees it. That is the
difference between evidence you have to go and find and evidence that
comes to you.

## The honest bit: "staged for go-live" is not the same as "live"

Here is the part most vendors skip. Not all of this happens overnight, and
pretending it does would be its own kind of dishonesty.

On that provider's build, the QA dashboard is genuinely live and in daily
use. The learning management system and its compliance layer are seeded
across all three branches and staged for go-live, which is a specific
thing, not a softer word for "done". It means built, courses loaded, and
tested on staging, waiting on the client's sign-off before it touches real
staff records. Care records are not a place to move fast for its own sake.
Every lane of this work was scoped, built on staging, reconciled against
the client's real exports, and board-gated before it went anywhere near
live data.

There is no filing cabinet that quietly organises itself the night before
an inspection. There is just one system, kept current on purpose, so the
answer is already there when someone asks.

## What I'd actually do about this

If inspection prep is a recurring fire drill in your business, work in this
order:

1. **Put training compliance in one place first.** Mandatory, refresher and
   overdue, tracked automatically. This is the evidence an inspector asks
   for most predictably, so it is the highest-value thing to stop tracking
   by hand.
2. **Add the oversight view second.** Once the underlying records are
   trustworthy, a dashboard that surfaces exceptions is mostly plumbing,
   not a separate project.
3. **Insist on honest delivery status.** "Live", "staged for go-live" and
   "in build" mean different things. A supplier who blurs them before an
   inspection is not one you want near your care records.

If you cannot tell where your own evidence gaps are, that is what an
[Automation Opportunity Audit](/services/) is for: a working session that
maps how your business actually runs and gives you a ranked, costed plan
for what to fix first. You can see the fuller care build behind this post
on our [care provider transformation](/work/care-provider-transformation/)
write-up. No obligation to do any of it with us, and the audit fee comes
off if you do.
