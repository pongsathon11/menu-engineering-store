# Menu Engineering System — Store

Sale page + Pro demo + automatic delivery, hosted on Cloudflare Pages.

- `index.html` demo (Pro, sample data, imports disabled) · `sale.html` sale page · `thanks.html` post-payment download · `privacy.html`
- `functions/api/` Pages Functions: `checkout` (Stripe Checkout, PromptPay + cards), `order`, `download` (decrypts the product and stamps the buyer's e-mail), `plans`
- `products/*.enc` product files, AES-256-GCM encrypted (key lives only in the `PRODUCT_KEY` secret)
- Env: `STRIPE_SECRET_KEY`, `PRODUCT_KEY`, `PRICE_MODE` (launch|regular), optional `DOWNLOAD_DAYS`, `SITE_URL`, `INVOICE_LINK`
