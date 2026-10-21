---
title: "B2B trade portals: what to build first, and what to leave for phase 2"
description: "Phase 1 of a B2B portal should be the smallest thing your team can use on a Monday and trust. What to build first, what to defer, where to draw the line."
date: 2026-07-28
sector: "General"
category: "Custom software"
tags: ["custom-software", "phased-delivery", "b2b-portal", "project-scoping", "small-business"]
draft: false
author: "Waseem Ilyas"
---

Every custom software project hits a moment where the wish-list meets the
calendar. How you handle that moment decides whether you get a working system
in a few weeks or a half-built one next year.

## Why big-bang launches go wrong for small teams

A big-bang launch is the one everybody pictures. Months of building, one
go-live date, the old way switched off on a Friday and the new way switched on
by Monday.

Large organisations can just about absorb that. They run both systems side by
side for a quarter, they have someone whose actual job is training, and if it
goes badly there is a fallback and a budget line for it. A team of twelve has
none of those things. Nobody has a spare afternoon to test a system that is not
live yet, so the testing happens on real orders in front of real customers.
There is no parallel run, because the same six people would have to do
everything twice. And the review arrives in one enormous lump: you are asked to
approve a system you have never used, on the day you start depending on it.

The quieter failure is what happens during the silent months in between.
Nothing to react to means every requirement stays a guess, and guesses drift.
By the time it lands, half of what you asked for in February is not what you
need in September, and nobody found out in time to say so.

## What should go in phase 1 of a B2B portal build?

Phase 1 should be the smallest version of the system your team could use on a
Monday morning and trust with real work. Not a demo and not a prototype: a
usable foundation that runs your main flow end to end, from the thing coming in
to the thing going out.

That means a thin slice through the whole process rather than a thick layer of
one part of it. A polished customer login with no order queue behind it is a
nice screen. An order that can be placed, priced, made, dispatched and turned
into a draft invoice is a business running on software, even with half the
reporting still missing.

The test is blunt. Can one of your people take a real job all the way through
without leaving the system to finish it off in a spreadsheet? If yes, that is a
foundation, and everything after it is an improvement on something that already
works. If no, it is not phase 1, it is a fragment, and you will be running two
systems until phase 2 lands.

## What we deferred on a real build, and why it wasn't a corner cut

For a UK plastics manufacturer and trade supplier, we built a trade portal
covering the order lifecycle: account-specific pricing, catalogue, ordering,
production records, dispatch records and invoice drafts, with per-customer
pricing computed by a rules engine rather than remembered. Phase 1 was signed
off in April 2026 as a usable foundation, running as a hosted preview behind
secure access, staged for client review.

Deeper accounting integration and full invoicing were deliberately scoped into
phase 2.

We drew that line where the system stops depending on someone else's system,
rather than where the work got hard. Order to dispatch sits entirely inside the
client's own four walls, so we control the rules, the data and the edge cases.
Posting finished invoices into an accounting package means living with a third
party's API, its authentication model and its opinions about what a valid
invoice looks like. Build that first and you are integrating against a process
you have not finished designing. Build it second and you are integrating a
shape you already know is right.

Deferring is not delivering less. It is being wrong earlier and more cheaply,
which is most of what good delivery actually is. The full write-up is in [the
trade portal case study](/work/manufacturer-trade-portal/).

## Four questions to phase your own project

1. **Which single flow, if it worked properly, would change your week?** That
   is the spine of phase 1. Everything else is scenery until the spine holds
   weight.
2. **Which parts depend on someone else's system?** Accounting packages,
   couriers, payment providers, anything with an API you do not control. Push
   them right, unless the integration is the entire point of the project.
3. **What can you load with real data on day one?** That trade portal was
   seeded from the client's own price-list workbook, so it stood up loaded with
   around 74 customers, 888 products and 1,263 price rules rather than three
   tidy fake ones. Fake data hides exactly the problems real data finds.
4. **What are you keeping just in case?** Every brief has items nobody can
   describe an actual Monday morning for. Those are not phase 2. They are phase
   never, and saying so out loud is the cheapest decision you will make all
   project.

Answer those four and you have a scope. Answer none of them and you have a
wish-list, which is a different document that costs a lot more.

## What to do with this on your own project

Write down your phase 1 in one sentence, in the form "someone in the office can
do X from start to finish without leaving the system". If you cannot finish
that sentence, the scope is not ready, and no amount of quoting will make it
ready. If you can, you have something a developer can price honestly and you
can check when it arrives.

There is no sleight of hand in any of this. Phasing well is just refusing to
guess for six months at a time, then testing what you built against real data
before anyone's Monday depends on it.

If you would rather work through it with someone who ships this sort of thing,
that is what an [Automation Opportunity Audit](/services/) is for: we map how
your business actually runs and hand you a ranked, costed plan for what to fix
first, from £450, with the fee credited against a Sprint (from £1,950) or a
Build (from £4,500) if you go on to do one. Fill in [the form](/contact/) and
Waseem reads it himself, then emails you back. We promise a meeting within one
week, and a human makes every decision along the way.
