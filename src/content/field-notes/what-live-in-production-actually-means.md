---
title: "What \"live in production\" actually means"
description: "A demo proves the idea. Production proves the system. Here is what a live automation project really needs, and the questions to ask before you commission one."
date: 2026-11-26
sector: "General"
tags: ["production", "automation-projects", "vendor-selection", "small-business", "engineering-discipline"]
draft: false
author: "Waseem Ilyas"
---

Plenty of automation projects die with a good demo behind them.

The demo is the easy day. Clean sample data, a friendly meeting, someone on hand to explain the odd bit. The project is the rest of it: a supplier sends a broken CSV at four in the afternoon, an integration changes without warning, and somebody has to notice before the client does.

That gap has a name in most engineering teams. Pilot purgatory. The work is real, the intent is real, and somehow the thing never quite becomes the system people rely on.

## What does "live in production" actually mean?

Live in production means the system is doing real work for real people on real data, with monitoring, backups, a restore someone has actually tested, and a named person who fixes it when it breaks. It does not mean deployed, launched, or handed over with a nice slide.

All three of those words get used as if they mean the same thing. They do not.

A demo proves the idea. A pilot proves the happy path. Production proves the system can survive a Tuesday.

## Why a pilot stalls

The pattern is usually the same, and it rarely has anything to do with the quality of the idea.

**The data stops being tidy.** Sample data has three customers and two products. Real data has duplicate records, missing fields, a supplier who sends prices in a different layout each month, and one customer whose name contains an ampersand that breaks something quietly.

**Nobody owns the boring parts.** Monitoring, alerting, backups and a rollback plan are not in the demo budget. They are the first things cut when the timeline tightens, and the first things you miss when something goes wrong.

**Success is declared too early.** The project is called a success when the demo lands. The honest test is ninety days later: is anyone still using it, and does the output still reconcile against the source?

## What production adds that a pilot does not

Production is not a bigger demo. It is a different standard of work. In practice it adds five things.

**A source of truth.** Every record has one place it is allowed to be right, and the system checks itself against it. When we built the care provider's platform, the outputs were reconciled against the client's real exports: 500 visits, 175 medication alerts, 416 names routed to review. The point was not the numbers. The point was that the numbers could be checked.

**Monitoring that tells you first.** Someone should know the job failed before the client rings. That means alerts on the things that matter, not a dashboard nobody opens.

**A backup and a tested restore.** A backup is a promise. A restore is evidence. If nobody has put one back, you do not know that it works.

**An audit trail.** If the system changes a record, approves a request or sends an invoice, you need to know what happened, when, and on whose say-so. Care records cannot have silent overwrites. Neither can most businesses.

**A named owner and a way back.** When it breaks at seven in the morning, whose phone rings? And if the fix makes things worse, how do you get back to the last good state?

## The standard we hold ourselves to

The care provider's production infrastructure runs on hardened, monitored, EU-hosted servers built as code. The documented audit came back with zero failures and zero warnings across every layer, and the restore was tested rather than assumed.

That sounds like a lot of unglamorous engineering, because it is. It is also the only reason a care provider can trust a small consultancy with the spine of its business. You can read the detail on the [care provider case study](/work/care-provider-transformation/).

We hold our own company to the same standard. The agents that run our finance, project tracking and website do the routine work, and a human signs off anything that leaves the building. The [About page](/about/) says plainly what is automated and what is not.

## Questions to ask before you commission anything

You do not need to be technical to tell production from a demo. Ask these and listen for specifics.

**What will you reconcile against, and who checks it?** A good answer names a real source and a cadence. A bad answer is "it should be right".

**How will I know it broke before my team does?** Look for monitoring, alerts and someone who reads them.

**When did you last restore a backup, and how long did it take?** If the answer is vague, the backup is a hope.

**What happens to the work in flight when something fails?** Production work has a queue, a retry, or a clear manual fallback. Demos have a shrug.

**Who fixes it at seven in the morning, and what does that cost?** Put the name and the arrangement in the contract before you need it.

**What is the rollback?** Every change should have a way back that someone has practised.

## Start small, but insist on production

Small and production-grade are not opposites. A Workflow Sprint takes one to three known workflows live in around two weeks, with you testing it as we go. That is deliberately a small surface area: fewer moving parts, a shorter path to something real, and a scope that leaves room for the unglamorous work.

What it does not skip is the part that makes it live. Monitoring, backups, a tested restore, an audit trail and a named human. The demo is the easy day. The rest is the job.

If you want a costed view of what is worth making live first, start with an Audit from £450. The fee comes off any Sprint or Build you go on to do, and the plan is yours to keep either way. Waseem reads every enquiry himself, and we promise a meeting within one week of first contact.
