---
title: "Reconciliation hell: why your systems don't agree with each other"
description: "To reconcile two systems, name one source of truth per record, check every copy against it automatically, and send only the mismatches to a person."
date: 2026-09-28
sector: "General"
category: "Operations"
tags: ["data-reconciliation", "operations", "data-quality", "exception-queue", "small-business"]
draft: false
author: "Waseem Ilyas"
---

Your rota says a support worker did four shifts last week. Payroll says
three. Both systems are working perfectly, which is exactly the problem.

## Why nobody notices until the meeting

Systems that are meant to mirror each other drift apart quietly. Nothing
crashes and nothing sends an alert. Invoices still go out, orders still
ship, the rota still gets filled. The gap only shows up when two people pull
the same figure from two screens in the same meeting and get two different
answers.

That is why it is one of the most common hidden costs in a small business:
it never appears as a line in any budget. It appears as someone's Thursday
afternoon, spent with two browser tabs open, working out which number is
real. Then it happens again next month, because nothing about the cause has
changed.

The usual suspects:

- **Rota and payroll.** A shift swapped on the rota and never updated on the
  timesheet.
- **Stock and orders.** A product code edited in one system and not the
  other, so the portal happily sells something the warehouse no longer has.
- **CRM and finance.** A customer marked active in one and archived in the
  other, and a revenue-by-customer report nobody quite trusts.

None of these is a software bug. Each system is faithfully reporting what it
was told. Nobody told them how to agree, and nobody built anything to notice
when they don't.

## How to reconcile data between two systems

To reconcile data between systems, name one system as the source of truth
for each type of record, treat every other copy as a mirror, compare the
mirror against the source automatically on a schedule, and send only the
mismatches to a person to resolve. That is the whole framework, in four
parts:

1. **A source of truth, per record type.** Not one master system for the
   whole business: one per entity. The rota might own who was scheduled,
   the clock-in system who actually turned up, the finance package what a
   customer owes. If you cannot say which system wins an argument about a
   given record, you don't have a data problem yet. You have a decision
   nobody has made.
2. **Mirrors follow, they don't argue.** Every other copy of that record is
   a mirror. It takes updates from the source. When staff edit the mirror
   directly because it happens to be the screen they have open, you now
   have two masters, and drift is guaranteed.
3. **A reconciliation check, not an audit.** A scheduled comparison of
   mirror against source that outputs only the differences. Records that
   match are nobody's business. Records that don't come out as a short,
   specific list: missing on one side, different value, different date.
4. **An exception queue with an owner.** That list has to land somewhere a
   named person works through it, fixes the source rather than the mirror,
   and clears it. A check whose output goes to an unread inbox is just a
   more expensive way of not knowing.

When two systems stay in step for months without anyone touching them, it
looks like a spell someone cast once and forgot about. It isn't magic. It's
very good engineering, and most of it is deciding in advance what happens
when the numbers disagree, instead of hoping they won't.

## What this looked like on a live build

On the core platform we built for [a ~600-person supported-living care
provider](/work/care-provider-transformation), the new system's report
mirrors were reconciled against the client's real exports before anyone was
asked to trust a number coming out of it. That check covered 500 visits,
175 medication alerts and 416 names routed to review.

Care makes the stakes easy to see. When the records are visits and
medication alerts, "roughly right" is not good enough. Every workstream on
that engagement was reconciled against the client's real exports and
board-gated before it went anywhere near live service-user data. The core
platform is live as a production pilot the client is actively using.

The same discipline applies whether the mismatch is a medication alert or a
pallet of stock. If a system's numbers have never been checked against a
source you already trust, you are taking them on faith.

If your problem is less "two numbers disagree" and more "the same person
exists twice under two spellings", that is a close cousin: identity
matching. We have written up [what identity matching actually
fixes](/field-notes/duplicate-data-what-identity-matching-fixes) separately.

## What to do yourself, and when to pay someone

A lot of this you can start this week with a spreadsheet and some honest
conversations.

**Do it yourself:**

- **List your pairs.** Write down every place two systems hold the same
  thing: people, shifts, stock, customers, invoices.
- **Pick the winner for each.** One line per pair: "for this record, system
  A is right". Get whoever runs each system to agree to it out loud.
- **Agree the matching key.** Decide what links a record in one system to
  its twin in the other. If the honest answer is "the name, spelled however
  someone typed it", fix that first.
- **Run one manual comparison.** Export both, compare them in a
  spreadsheet, count the mismatches. That count tells you whether you have a
  tidy-up or a structural problem.

**Worth paying someone when:**

- **It's weekly.** The comparison needs doing every week and the
  export-and-compare routine is eating real hours.
- **Matching gets fuzzy.** Typos, nicknames, changed addresses, merged
  records: the kind of matching a spreadsheet lookup gets confidently wrong.
- **You want it to run itself.** A scheduled check, an append-only audit
  trail of every correction, and an exception queue inside the system rather
  than in someone's inbox.
- **A miss is expensive.** Payroll, invoicing, or anything an inspector
  will read.

## Where to start

If your team spends time every month working out which system is telling
the truth, that time is the cost, and it is usually bigger than anyone has
written down.

An [Automation Opportunity Audit](/services), from £450, is where we would
start: map which systems hold what, find where they disagree, and give you
a costed plan for what to fix first. The fee is credited against any project
you go on to do. A real person, Waseem, reads what you send and replies
personally, and we promise a meeting within one week.
