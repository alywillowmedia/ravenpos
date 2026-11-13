# Gift card artwork redesign

## Intent

Gift cards are drawn in flat colour with a hairline frame. They should carry
each brand's own illustrated look: Alywillow's pale-blue wildflower border and
Ravenlia's vintage parchment border. Shape and size stay exactly as they are
(3.89 x 2.39 in, landscape, 8 to a letter sheet).

## Goals

- Alywillow cards use the "tall flowers" blue border; Ravenlia cards (store-wide
  and every other vendor) use the parchment border, lightened.
- Layout follows the owner's sketch: logo top centre; To on the left, amount in
  the middle, From on the right; a rule, then the message; barcode, code and
  "Good for ..." line at the bottom centre.
- Alywillow logo tinted deep green; Ravenlia logo in red and black.
- A soft light glow (about 78%) sits behind the message, code and scope line so
  they read over the art.
- Every occasion uses its brand's art. Only the line under the logo and an
  accent colour change.
- Preview, customer display, picker thumbnails and print all change together.

## Non-goals

- The gift card email stays as it is.
- No change to card size, sheet layout, sale flow, or stored data.
- No raven illustration on the card.

## Anti-goals

- Text running into the border art.
- A barcode that scans worse than today's.

## Approaches

1. **Background image with live text in the existing `GiftCardFace` (chosen).**
   One component already feeds preview, display, thumbnails and print, so all
   change together and the size is untouched.
2. A finished image per brand and occasion with only names and amount overlaid.
   Needs ten pieces of art and new art for every wording change.
3. Redraw the borders in code. Loses the illustrations.

## Decisions

- Art lives in `src/assets/giftcards/` and is imported, so the bundler resolves
  the URLs. The parchment is saved as a lightened file, not lightened in CSS, so
  print matches screen.
- The art is stretched to the card (about 8% vertical squeeze from 3:2) rather
  than cropped, so the corner ornaments stay whole.
- The drawn `Motif` ornaments and the per-occasion background colours go away.
  Each occasion keeps a headline and one accent colour per brand.
- Empty To / From / message show writing lines, as today.
- Thumbnails (`simple`) show logo, occasion line and amount over the same art.
- Fonts: Cormorant Garamond, Cormorant SC and Pinyon Script for Alywillow;
  IM Fell English (+SC), Playball and Playfair Display for Ravenlia. Added to
  the Google Fonts link in `index.html`, replacing Fraunces and Newsreader,
  which only the old card used.
- Expect heavier ink use when printing, most on the Ravenlia card.

## Left to the builder

Exact spacing and font sizes, tuned in the browser against the mockups in
`.superpowers/brainstorm/` (`cards-v6.html`).
