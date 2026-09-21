---
title: "Duplicate data, orphan records: what identity matching actually fixes"
description: "Identity matching is comparison logic plus a human queue. On a live migration it auto-resolved 274 of 418 duplicate candidates for us."
date: 2026-09-21
sector: "General"
category: "Data migration"
tags: ["identity-matching", "data-migration", "deduplication", "data-quality", "erp"]
draft: false
author: "Waseem Ilyas"
---

Two systems. The same person. Spelled three different ways, with no shared
ID connecting them. It is the least glamorous problem in small-business
software, and it quietly undermines everything you build on top of it.

## What identity matching actually does

Identity matching decides, record by record, whether two entries in
different systems refer to the same real person or to two different people.
It is not a black box and it is not artificial cleverness. It is comparison
logic: a defined set of rules and signals, weighed against each other, with
a human review queue attached for the cases the logic cannot honestly call.

The signals are whatever the source data actually gives you. Name and its
common variants. Date of birth. Address. Role, branch, employee number,
National Insurance number where it exists. Start date. Each one is evidence,
none of them is proof on its own, and the logic's job is to say how much of
it has to agree before two records are treated as one person.

Where the signals agree strongly, the system resolves the match itself.
Where they conflict, or where too much is missing to be sure, it does not
guess. It routes the record to a person. That queue is the point of the
design, not an admission that the automation fell short. A wrong call about
whether two people are the same person is exactly the kind of mistake that
should never be made silently.

It looks like sorcery when a system untangles ten thousand records
overnight. It isn't. It's very good engineering, and the trick is entirely
in deciding which cases it refuses to touch.

## Why "just import the CSV" is how you end up with duplicates

A straight import does not clean anything. It moves your mess into a new
system faster, and now the mess has an official-looking interface in front
of it.

Two specific failures follow, and you will meet both:

- **Duplicates.** The same person exists twice, because one system has
  "Kathryn O'Neill" and the other has "Katherine O Neill". Both records
  start accumulating real history. Six months later, half a person's
  training sits on one record and half their shifts sit on the other, and
  neither view of them is true.
- **Orphan records.** A row that points at something which no longer
  exists, or never did: a visit attached to a service user ID that the
  import renumbered, a training certificate attached to a staff record that
  got superseded. Orphans are worse than duplicates because they do not
  show up in a list of names. They show up as a number that is quietly
  wrong in a report.

Neither of these announces itself. They surface later, in a meeting, when
two people have pulled the same figure from two systems and got different
answers.

## The real number, from a live migration

On a live migration for [a ~600-person supported-living care
provider](/work/care-provider-transformation), identity matching
auto-resolved 274 of 418 review candidates. The same roster import created
**294 carers and 293 service users** as clean, canonical records, straight
out of the client's own CSVs.

Read what that ratio actually claims, because it is not "no humans needed".
It says the people doing the work got to spend their attention only on the
candidates that genuinely needed a judgement call, instead of re-checking
several hundred records the logic had already settled with evidence. That
is the honest promise of this kind of work: not the removal of human
judgement, but the removal of everything around it that was wasting it.

The other half of getting it right is checking your own work against
reality. On the same build, the platform's report mirrors were reconciled
against the client's real exports, covering 500 visits, 175 medication
alerts and 416 names routed to review, before anyone was asked to trust a
number coming out of the new system. Importing data is the easy part.
Proving the imported data agrees with what the business already knows is
the part that earns the trust.

## This is not a care-sector problem

It looks like one, because care records make the stakes obvious. The
pattern is everywhere two systems are meant to agree and don't:

- A CRM and a finance system holding the same customer under two spellings,
  so your revenue-by-customer report has been wrong for a year.
- A stock system and an order system that drifted apart after someone
  bulk-edited product codes.
- A rota and a payroll run that disagree about who worked Tuesday.
- A price-list workbook where one product code means two different things
  on two different tabs.

Any automation you build on that data inherits the problem and speeds it
up. Clean the records first, or you are just getting to the wrong answer
more efficiently.

## What to do about it before you automate anything

If you suspect your records disagree with each other, here is the order we
work in:

1. **Name your source of truth, per entity.** For every important thing
   you track, one system is right and the others are copies. If you cannot
   say which, that is the actual problem and no amount of software fixes it
   for you.
2. **Count the overlap before you migrate.** Export both systems, match on
   the obvious fields, and look at how big the ambiguous pile is. That
   number tells you whether this is an afternoon or a workstream.
3. **Write down what "same person" means for you.** Which fields must
   agree, which are supporting evidence, which are useless in your data.
   This is a business decision, not a technical one, and it should be
   written down before anyone codes against it.
4. **Insist on an audit trail.** Whatever merges your records should keep
   the history of every merge, correction and flag. If a system cannot show
   you why two records became one, you cannot undo its mistakes.
5. **Reconcile after the import, not just before.** Check the new system's
   output against exports from the old one. Do it while you still have both.

Points one to three you can do yourself this week, with a spreadsheet and
an hour of arguing. Points four and five are where it usually becomes worth
paying someone.

If you would rather have that mapped out properly before you commit to
building anything, that is what an [Automation Opportunity
Audit](/services) is for, from £450: where your records disagree, what it
would take to make them agree, and what it is worth fixing first. A real
person reads what you send and writes back.
