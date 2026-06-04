# Tokenometer Marketing Site Design

Last updated: 2026-06-04

## Purpose

Design a marketing site that:

- explains Tokenometer clearly
- feels product-led and mature
- routes visitors into Demo or App
- does not disturb the current operator app

For now, this should first exist as a **preview route inside the current codebase**, so it can be reviewed safely before any domain move.

## Implementation Principle

The current app remains the real product.

The marketing site is:

- a separate public-facing surface
- calmer
- more explanatory
- less operator-dense

## Route Strategy

For the preview phase:

- create a dedicated marketing route

Recommended preview route:

- `/site`

This lets the page exist now without changing the current root app behavior.

## Visual Direction

Overall tone:

- dark, technical, premium
- product-first, not generic startup fluff
- confident and modern
- readable and credible

Mood:

- “serious AI infrastructure”
- not cold, not crypto-like, not overly financial

## Color Direction

Reuse the current brand foundation, but with more range and pacing than the app shell.

Primary:

- cyan / electric aqua

Supporting accents:

- green for trustworthy/healthy
- violet or indigo for system depth
- amber only where risk or caution is discussed

Avoid:

- a monotonous all-slate experience
- decorative gradient blobs
- oversized card-stacking everywhere

## Layout Strategy

The page should use full-width section bands with constrained inner content.

Avoid:

- floating card sections for the whole page
- hero text inside a box/card
- split-screen generic SaaS hero patterns

Preferred structure:

1. Hero with full-bleed product screenshot background
2. Problem / positioning band
3. How it works band
4. Product surfaces band with screenshots
5. Differentiation band
6. Audience band
7. Final CTA band

## Hero

### Goal

Make the product understandable immediately.

### Structure

- full-width hero
- real Tokenometer screenshot as the background
- dark overlay for readability
- headline and CTA block aligned left
- next section slightly visible below the fold

### Hero content

- eyebrow
- clear headline
- compact supporting copy
- two main CTAs
- one row of proof chips

### CTA hierarchy

Primary:

- `Open Demo`

Secondary:

- `Open App`

Optional tertiary:

- `Book a Walkthrough`

## Visual Assets

Use real product screenshots from the Stitch assets.

Recommended assets:

- dashboard screenshot for hero
- credentials / sync health screenshot
- ledger screenshot
- wallet screenshot
- spend screenshot

Why:

- the product is real
- the screenshots already communicate maturity
- real product proof is stronger than illustration here

## Content Bands

## 1. Problem band

Purpose:

- establish why Tokenometer exists

Format:

- concise heading
- two short paragraphs or bullet clusters
- one side can include a compact comparison list

## 2. How it works band

Purpose:

- explain the three measurement paths simply

Format:

- three repeated feature cards
- each card focused on one path

Cards are appropriate here because they are repeated content items, not the whole page section.

## 3. Product surfaces band

Purpose:

- show what the app actually contains

Format:

- screenshot-led composition
- short captions
- no giant walls of text

Suggested surfaces:

- Gateway
- Ledger
- Reports
- Governance

## 4. Differentiation band

Purpose:

- explain what makes Tokenometer more than a dashboard

Format:

- 4 or 5 compact feature statements
- more technical and category-defining

## 5. Audience band

Purpose:

- help visitors self-identify quickly

Format:

- three audience blocks
- short and practical

## 6. Final CTA band

Purpose:

- route the visitor cleanly

Format:

- headline
- brief closing copy
- strong CTA row

## Typography

Use the existing type system:

- display font for headline
- manrope/inter body and detail styles

Guidelines:

- hero headline large but not cartoonish
- section headings compact and clear
- body copy short and airy
- avoid long dense paragraphs

## Interaction Level

For the first pass:

- fully navigable
- CTA buttons work
- anchor links or smooth page flow okay
- no need for complex animations

Nice-to-have polish:

- subtle hover motion
- image lift or border emphasis
- soft reveal transitions

Avoid:

- heavy animations
- gimmicky scroll tricks
- anything that slows down clarity

## Relationship to Current Shell

The marketing route should not inherit the full operator-app chrome.

That means the preview page should ideally render:

- without Sidebar
- without MobileNav
- without the normal operator Topbar

It should feel like its own public-facing surface even while living in the same codebase temporarily.

## Accessibility / Clarity

Ensure:

- strong contrast over hero background
- clear CTA labels
- text remains readable on all screenshots
- no overlapping UI
- mobile hero text stays compact and visible

## Mobile Behavior

On mobile:

- hero text stacks cleanly
- CTAs become vertical or two-row if needed
- screenshots remain legible and cropped intentionally
- section spacing stays generous

The page should still hint at the next section from the hero.

## Done Enough for First Pass

The first marketing build is successful if:

- it looks like a real product site
- it uses real Tokenometer visuals
- it explains the product clearly
- it routes users to Demo and App
- it does not interfere with the current operator app

## Next After Design

After this design brief:

1. implement the `/site` preview route
2. review visually
3. refine copy and hierarchy
4. later map the route to root domain / subdomain structure
