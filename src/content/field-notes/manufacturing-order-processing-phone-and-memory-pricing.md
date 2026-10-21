---
title: "Manufacturing order processing: getting off phone-and-memory pricing"
description: "Trade pricing kept in someone's head is a single point of failure. What a B2B trade portal for a UK manufacturer actually needs, and in what order."
date: 2026-07-20
sector: "Manufacturing / building-products trade supply"
category: "Manufacturing"
tags: ["trade-portal", "manufacturing", "pricing-engine", "b2b", "custom-software"]
draft: false
author: "Waseem Ilyas"
---

Ring most UK trade suppliers with an account and you get a person, not a
system. They know who you are, they know your pricing, and the order is on
its way before you have finished the sentence. That is genuinely good
service. It is also one head cold away from being no service at all.

## What actually goes wrong when the pricing lives in someone's head

Per-customer trade pricing is a relationship asset. A builder gets a better
rate because they have bought every month for years, and someone in the
office knows that. Nothing about the arrangement is written down anywhere a
computer could check it.

The failure modes are boring and predictable, which is exactly why they get
tolerated for years. The person who remembers is off, so an order sits until
Thursday or goes out at the wrong number. The account list grows past what
one memory can hold, and quotes start drifting. A price gets given wrong and
eats the margin on that job quietly, because nobody reconciles quoted price
against list price afterwards. Then that person retires, and a good chunk of
your commercial policy retires with them.

None of that is an argument for stripping the relationship out of the sale.
It is an argument for writing the relationship down, so the system knows what
the person knows and the person is freed up to do the part only a human can.

## What does a B2B trade portal for a manufacturer actually need?

A trade portal earns its keep when order, production, dispatch and invoicing
run as one flow rather than five disconnected tools. In practice that means:
account-specific pricing computed per customer, a catalogue those customers
can browse themselves, ordering and quick reordering, a staff-side order
queue, production records, dispatch records, and a draft invoice that falls
out of the end of the process instead of being typed up from scratch.

The word carrying the weight there is "one". Most manufacturers already have
every item on that list. They just have them in six places: an inbox, a
whiteboard, a price-list spreadsheet, an accounting package, a delivery book
and someone's memory. Every join between those six is a re-key, and a re-key
is where the number goes wrong.

## The multi-unit problem generic e-commerce doesn't solve

If you sell building products, you do not sell in units. You sell in feet,
metres, square feet, square metres and each, and the same product moves
between them depending on who is buying and what they are doing with it.

Off-the-shelf e-commerce platforms are built for a world where a product has
a price. Yours has a price per unit type, per customer, which is a different
shape entirely. Force it into a shopping-cart platform and you end up
maintaining a spreadsheet alongside the system that was supposed to replace
the spreadsheet.

There is a second thing generic platforms rarely handle well: what happens
when the sheet price moves. If a supplier puts up your raw material cost, you
need to reprice in bulk and have every account's specific arrangement follow
along, not hand-edit hundreds of rules and hope. Add cross-border orders into
Ireland and the gap between "an online shop" and "a trade system" is fairly
obvious.

## What we built for one manufacturer

For a UK plastics manufacturer and trade supplier, we replaced informal
order-taking with a full trade portal covering the whole order lifecycle.
Customer side: a public brochure site, secure passwordless login for trade
customers, and a portal showing their own account-specific pricing, the
catalogue, ordering and quick reorder. Staff side: a workspace for managing
customers, products and price rules, an order queue, production records,
dispatch records and invoice drafts.

At the centre sits a multi-unit pricing matrix covering feet, metres, square
feet, square metres or each, with bulk reprice, plus handling for cross-border
orders into Ireland. The demo was seeded from the client's own real price-list
workbook, so it stood up loaded with around 74 customers, 888 products and
1,263 price rules on day one rather than three tidy fake ones.

Phase 1 was signed off in April 2026 as a usable foundation: order to dispatch
working end to end, running as a hosted preview behind secure access, staged
for client review. Deeper accounting integration and full invoicing were
deliberately scoped into Phase 2, so the client got something real early and
we built the rest on proven ground.

Per-customer pricing is now computed rather than remembered. That is the whole
trick, and it is not much of a trick: it is a rules engine, written down
carefully, tested end to end. Not magic. Just very good engineering. You can
read the full write-up in [the trade portal case
study](/work/manufacturer-trade-portal/).

## Where to start if this sounds like your business

You do not have to commission a portal to make progress this quarter. Start
with three questions, in this order.

1. **Where does your pricing actually live?** If the honest answer is "in
   Dave's head and a spreadsheet only he opens", that is your single point of
   failure, and it is a bigger commercial risk than any software decision you
   are weighing up.
2. **How many times does one order get typed in?** Count the re-keys between
   the enquiry landing and the invoice going out. Count them honestly,
   including the ones that feel too small to count. Each is a place a digit
   can slip.
3. **What is the smallest useful first phase?** Not the finished system. The
   smallest thing your team could genuinely use on a Monday morning and
   trust. If nobody can name it, the scope is not ready yet.

Those three answers will tell you more than any vendor demo will. If you would
rather work through them with someone who builds this sort of thing for a
living, an [Automation Opportunity Audit](/services/) is exactly that: we map
how your business actually runs and hand you a ranked, costed plan for what to
fix first, from £450, with the fee credited against any project you go on to
do. No funnel, no discovery-call theatre. Just a straight look at where your
orders are leaking time.
