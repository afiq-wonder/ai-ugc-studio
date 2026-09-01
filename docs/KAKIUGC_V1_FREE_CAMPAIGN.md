# KakiUGC V1 — Commercial Package Contract

Status: LOCKED
Date: 2026-09-01

## Launch package

KakiUGC is sold for **RM129 one-time**.

The purchase includes:

- Unlimited KakiUGC Director campaigns.
- Unlimited/copyable production prompts.
- **60 AI image generations**.
- **20 AI video generations**, each with a maximum duration of **8 seconds**.
- Image and video balances are independent.
- Included generation allowance is one-time, not recurring.

## Reload packages

After the included generation allowance is depleted, customers can reload generation without repurchasing Director access:

- **RM59 Reload** — 30 images + 10 videos, each video up to 8 seconds.
- **RM99 Reload XL** — 60 images + 20 videos, each video up to 8 seconds.

Reload balances add to any remaining balance and do not expire merely because another reload is purchased.

## Entitlement rules

- One successful image generation consumes one image unit.
- One successful video generation consumes one video unit, with generated duration capped at 8 seconds.
- Technical/provider failures must not consume a customer unit.
- Reservations abandoned for more than 30 minutes must be failed and their reserved unit restored.
- The backend is authoritative for balances, reservations, consumption, refunds and payment fulfillment.
- Browser/localStorage state must never be the source of truth for paid generation entitlement.

## Product principle

**KakiUGC Director is the intelligence layer. Generation providers are replaceable execution engines.**

Provider/model selection remains internal. KakiUGC may change generation providers according to quality, task suitability and operating cost without changing the customer-facing package allowance.

## Commercial baseline

The launch economics are planned around a maximum 40% generation allowance, 10% infrastructure/operational allowance and a 50% retained target. These are internal operating guardrails, not customer-facing credit values.

## Positioning

> Generate here, or take your KakiUGC prompts anywhere.
