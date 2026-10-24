# UI / UX audit: current build vs. Marchese reference

## Current BAC Water build
- Strong clean palette and responsive base.
- Main weakness: the hero uses a CSS-drawn vial, so the product feels conceptual rather than retail-ready.
- The primary purchase decision appears too far down the page.
- Several sections repeat the same trust/compliance message.
- Interactions are DOM-event based rather than component/state based.
- Product page lacks a true image gallery and a compact purchase-focused hero.

## Marchese referenceaa
Useful patterns:
- Real product photograph is the visual anchor.
- Price, vendor, quantity and Add to Cart are grouped tightly.
- Description, bulk pricing and shipping information are available directly on the product page.

Patterns intentionally not copied:
- Large multi-category navigation.
- Generic Shopify catalogue styling.
- Dense policy copy directly beneath the purchase controls.
- Retailer-specific low-stock and pickup language.

## React v2 direction
- Single-product premium medical storefront.
- Real Hospira/Pfizer product imagery in the product gallery (temporary external reference URLs; replace with licensed/owned photos before launch).
- React state for gallery, pack selection, cart drawer and FAQ.
- Purchase module above the fold.
- Mobile sticky Add to Cart.
- Health Canada verification card.
- Reduced content density and repeated copy.
- No account/login UI.
