# Test pages

These HTML files stand in for Cardmarket pages in the tests.

**The current files are hand-made imitations**, based on another extension's selectors and a screenshot, not on real saved pages. Replace them with real pages when you can:

1. Open the page on Cardmarket (logged in), press **Ctrl+S** and choose **"Web Page, HTML only"**.
2. Remove personal data before committing: your name, address, username, e-mail, order numbers, and anything else you don't want public. Search the file for them.
3. Optionally cut it down to the relevant part (the cart blocks or the offers table). Keep the real structure and class names as they are.
4. Save it here under the same name, and update the expected values in the matching test.

| File | Page | Used by |
|---|---|---|
| `cart.html` | `/Magic/ShoppingCart` with 3 sellers | `cart.test.js` |
| `offers-list.html` | Seller offers, older list layout (`.article-row` divs) | `offers.test.js` |
| `offers-table.html` | Seller offers, table layout (`<tr>` rows, Name / Info columns) | `offers.test.js` |
