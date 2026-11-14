# Gift Card Artwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw gift cards over each brand's illustrated border in the sketched centred layout, at the unchanged 3.89 x 2.39 in size.

**Architecture:** `GiftCardFace` keeps its fixed 778 x 478 design box scaled by `--gc-scale`. The brand's art is a stretched background image on `.gcf`; logo, names, amount, message and barcode are live elements on top. Occasions keep a headline and gain one accent colour per brand; the per-occasion palettes and `Motif` ornaments are removed.

**Tech Stack:** React, TypeScript, Vite asset imports, plain CSS, jsbarcode, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-gift-card-artwork-design.md`

## Global Constraints

- Card stays `aspect-ratio: 3.89 / 2.39`; print stays `scale(0.48)`, 2 x 4 per letter sheet.
- Art is stretched (`background-size: 100% 100%`), never cropped.
- Email function `supabase/functions/send-gift-card-email` is not touched.
- Barcode bars must be at least as wide as today (about 245px of the 778px design).
- No commits unless the owner asks.

## Review Focus

- Long recipient / sender names: wrap to two lines, then clip; must not push the amount off centre.
- Long message: clamps to two lines.
- Empty To / From / message: writing lines appear instead.
- Card with no code yet: placeholder bars and `GC-··········`.
- Unknown `theme` value on an old card: falls back to the everyday occasion.

---

### Task 1: Artwork files

**Files:**
- Create: `src/assets/giftcards/alywillow-bg.webp` (tall-flowers blue border)
- Create: `src/assets/giftcards/ravenlia-bg.webp` (parchment, lightened: cream `rgb(255,252,242)` at 62% inside the centre ellipse fading to 14% at the edges)
- Create: `src/assets/giftcards/alywillow-logo.webp` (minimal logo, tinted deep green)
- Create: `src/assets/giftcards/ravenlia-logo.webp` (red and black logo, transparent)

- [ ] Produce the four files with ImageMagick / copies from the mockup folder.
- [ ] Verify by viewing each file.

### Task 2: Occasion data

**Files:**
- Modify: `src/lib/giftCardThemes.ts`
- Test: `tests/giftCardThemes.test.ts`

**Interfaces:**
- Produces: `GiftCardOccasionDef.accents: Record<GiftCardBrand, string>` replacing `palettes`; `GiftCardPalette` removed.

- [ ] Test: every occasion has a non-empty accent for both brands; `getGiftCardOccasion('nonsense').id === 'everyday'`.
- [ ] Run it, see it fail, implement, see it pass.

### Task 3: Card face and styles

**Files:**
- Modify: `src/components/giftcards/GiftCardFace.tsx`
- Modify: `src/components/giftcards/giftcards.css`
- Modify: `index.html` (Google Fonts link)

**Interfaces:**
- Consumes: `accents` from Task 2. `GiftCardFaceData` and the `simple` prop are unchanged.

- [ ] Replace the two-column markup with: top (logo, headline), middle (To, amount, From), message (rule, note or writing lines), bottom (barcode chip, code, scope). `simple` keeps logo, headline and amount only.
- [ ] Brand classes `gcf-alywillow` / `gcf-ravenlia` set art, logo, fonts, ink and glow.
- [ ] Add the fonts named in the spec to the link in `index.html`.
- [ ] Verify: `npx tsc -b`, `npm test`, and in the running app check the sale preview, the design thumbnails and print preview for both brands against the Review Focus list.
