# Codex v3

## What changed this round
- Full professional redesign: white background, clean typography, restrained
  green + amber accents, standard shadows instead of glow. No more neon.
- Real photo/video uploads (cover photos, ad videos, all proof-of-payment
  screenshots) via a new /api/upload endpoint - opens the phone's own
  gallery/file picker, nothing simulated.
- 12 additional features: order lookup by phone/email, a listings filter by
  seller phone (convenience only, not a login), a price range filter, related
  books, 15-minute order cancellation, seller-marked refunds, low-stock
  badges, a sales dashboard, downloadable receipts, a submit-then-confirm
  flow for subscription payments (matching how ads already work), Escape-to-
  close + alt text + focus outlines, and a share button on book details.

## Deploy (same flow as before)
1. Copy server.js, package.json, and public/index.html over your existing
   files in ~/codex-backend.
2. git add . && git commit -m "..." && git push
3. Render will reinstall dependencies automatically (multer is new) and
   redeploy. No new environment variables are needed - ADMIN_KEY still
   applies to ad and subscription confirmation.

## Important: uploaded files are not permanent yet
Render's free tier disk is wiped on every redeploy (and can reset on a free
instance spin-down/restart). Uploaded cover photos, ad videos, and proof
screenshots - and data.json itself - will not survive that. This is fine for
demoing and testing, but before this goes fully live, swap local disk storage
for either Render's paid persistent disk or an object store (Cloudinary,
Backblaze B2, S3) for uploads, plus a real database (Postgres) for the data.
