---
title: "Can your supplier prove a restore? Five questions to ask"
description: "Every software supplier says they back up. Here is the evidence to ask for: backup age, an isolated restore, integrity checks, a measured time, and what cannot be rolled back."
date: 2026-11-01
sector: "General"
category: "Buying software"
tags: ["backup", "disaster-recovery", "vendor-selection", "small-business", "software-buying"]
draft: false
author: "Waseem Ilyas"
---

Almost every software supplier will tell you they back up. Far fewer can show
you the last time they put one back. A backup is a promise. A restore is
evidence, and it is the only part of the arrangement you cannot check by
reading the contract.

This is the list I would work through before trusting a supplier with the
records your business cannot recreate. It is also the list we hold ourselves
to, including the parts we have not finished yet, which are named at the end
rather than left out.

## 1. How old is the newest backup?

Ask for a date, not a frequency. "Nightly" is a schedule; "the newest copy is
from 03:30 this morning" is a fact, and it is the one that tells you how much
work a bad afternoon would cost you. The technical name for that is the
recovery point objective, or how much data you are willing to lose.

The gap matters more than it sounds. On our own systems, a power cycle at 03:17
on 1 November 2026 damaged eleven transcripts of work in progress. The nightly
backup runs at 03:30. Those records existed only in memory, so they were never
copied anywhere and could not be recovered. Thirteen minutes was all the
exposure there was, and it still cost data that cannot be recreated. A weekly
backup, or a nightly job that quietly stopped three weeks ago, would have cost
far more.

So ask two things: when did the newest copy finish, and what would make the
schedule stop without anyone noticing? A backup that fails silently is worse
than one that does not exist, because you are relying on it.

## 2. Was the restore done somewhere isolated?

A restore that runs over the live system proves nothing and risks everything.
The useful evidence describes a restore into a separate place: a different
machine, a throwaway database, a private directory, with the live system left
untouched.

Our own drill restores the newest file from each backup set into a private
temporary directory that only the drill can read. Where the backup is a
database, it is replayed into a disposable database container that has no
network connection at all, so it cannot reach anything real. That is a
deliberately boring design, and boring is the point: a drill that can damage
production will eventually damage production.

Ask where the last restore ran, and whether anything live was in reach while
it did.

## 3. Did they check the data, not just the files?

A backup can decrypt, unpack and restore perfectly and still be useless. Empty
files, truncated databases and corrupted pages all pass a test that only asks
"did the file come back".

The checks worth asking about are concrete. Ours fail the drill when the newest
file in a set is empty, when the restored size does not match the size the
backup lists, and when a checksum of the restored copy differs from the
original file, where the original is still there and unchanged. For the
dashboard's own backup, the database dump has to replay without error and its
documents and indexes tables have to contain rows; "it imported" is not enough
if the tables came back empty. Separately, a weekly job re-reads and decrypts a
quarter of all stored backup data, so every part is verified at least once
every four weeks.

Ask what would make a restore fail their test. If the answer is "nothing, it
either restores or it doesn't", they are checking the file, not the data.

## 4. How long did the restore take, measured?

Ask for a duration from a real run, not a target from a plan. A plan that says
"under two hours" is a hope until somebody has timed it. The measured number
is the recovery time objective, and it is the one you would be living through
on the day.

For a UK care provider's ERP that we run, the point-in-time restore drill on 31
August 2026 put the system back online in about 200 seconds, with under a
minute of data at risk. That is a receipt: a date, a system, a measured time and
a measured data gap. A number like that is worth more than any paragraph about
resilience.

Watch for the difference between restoring a file and rebuilding a service. Our
written plan for another system targets under two hours on the same host and
under four hours on a fresh one. Those are targets. The drill that proved that
system's backup could be opened and replayed did not rebuild a host, so the
four-hour figure is not measured and we do not present it as if it were.

## 5. What cannot be rolled back?

Every restore has a limit, and the limit is the part suppliers leave out. Ask
what the backup does not contain, and what a restore would not put back.

Three limits are common and worth naming. First, anything written after the
backup is gone; that is the number in question 1. Second, some data is left out
on purpose. Sign-in secrets and encryption keys are usually excluded, because
keeping them beside the backup would defeat the point, which means a real
recovery includes reprovisioning them, and that step needs a plan and a person
who knows how. Third, a validated backup is not a tested cutover. One client
database we run has its dump checked in a throwaway database, and there is no
tested procedure for putting that dump live in production. "The dump is good"
and "we can run on it by Monday" are different claims, and only the first one
is proven today.

There is a related trap with failover. A standby server that answers a login
request is not a rehearsed failover. Our own standby was shown to accept
sign-ins on 1 November 2026, but the takeover itself has not been drilled. It
is the same class of gap: something is running, and nobody has yet proved the
whole switch works.

## What a receipt looks like

Ask for one page, and do not accept a policy document in its place. It should
say: the date, what was restored, which backup it came from, where it was
restored to, which checks passed, how long it took, who ran it, and what the
restore did not cover. If a supplier cannot produce that for any system, the
honest reading is that no restore has been proved, whatever the contract says.

## What to send them

A short message is enough. Copy this if it helps:

> Please send the most recent restore test for the system we would be buying.
> I would like the date, what was restored, where it was restored to, the
> checks that passed, how long it took, and anything the test did not cover.
> If there has not been a test, please tell me when the first one is planned.

The answer tells you more about how they operate than a demo does.

## Our own gaps, so you can hold us to the same standard

We ask these questions of suppliers, so here is where we stand.

Restore proof across the systems we run is uneven. The care provider's ERP has
the measured drill quoted above; it is the only client system our 8 October
2026 security review could mark as proven. The same review marked several
others unverified on exactly this point, including a portal whose backups had
never been drilled, and managed database services where the restore window and
the restore itself had not been tested. That review says unverified, not
passed, and we have left it that way.

Two wider gaps are also still open. The first drill against our new
offsite backup repository was due at 04:01 UTC on 1 November 2026, and we are
not counting that copy as proven until its result is recorded. And as of the
same 8 October review, one weekly drill's last result could not be found in the
log, which we treat as a missing receipt rather than a pass.

The rule we work to is one we learned the hard way: an unproven backup is not a
backup. It is why we ask these questions of ourselves first, and why the gaps
above are written down rather than quietly dropped from the page.

## What I'd actually do about it

Ask for the last receipt before you sign, and ask what it did not cover. If
there is no receipt, ask for a date for the first drill and get it in writing.
Then put the same two questions to your own setup, because most small
businesses cannot answer them either.

If you want a second pair of eyes on a supplier's answers, or on your own
backups, that is what an [Automation Opportunity Audit](/services/) is for:
from £450, credited in full against any project you go on to do, and you keep
the plan either way. Or just fill in [the form](/contact/). Waseem reads it
himself and emails you back.
