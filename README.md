# Codex v4

## What changed this round
- Removed the "Company subscription" section entirely, per request — it was
  the wrong place for that payment and is gone from the nav, the UI, and
  the backend API.
- 25 additional features, all real and working:
  1. Wishlist (per-device, heart icon on every card)
  2. Recently viewed strip on the Shop tab
  3. Pagination ("Load more", 12 at a time)
  4. Cover photo lightbox/zoom in the detail view
  5. CSV export of all orders (Manage section)
  6. 7-day orders bar chart (Manage dashboard)
  7. Dark mode toggle (persists, respects system preference by default)
  8. "Verified seller" badge (5+ dispatched orders)
  9. "Notify me" when an out-of-stock book is restocked (counter, visible
     to the seller in Manage)
  10. Average seller rating in the sales dashboard
  11. Breadcrumb trail in the book detail view
  12. Terms of use + Privacy policy (footer links, modal)
  13. Sticky "Buy now" bar on mobile when viewing a book
  14. Dynamic page title per tab / per book
  15. "/" keyboard shortcut focuses search
  16. Inline red-border validation on the Sell form, not just toasts
  17. Order status pill (Pending/Dispatched/Cancelled/Refunded) in Manage
  18. Friendly duplicate-listing error (same title+author blocked server-side)
  19. "Copy tracking number" button in Manage Orders
  20. Draft autosave for the "List a book" form (survives navigating away)
  21. Review "Helpful" voting (per-device, one vote per review)
  22. "Needs attention" low-stock panel at the top of Manage
  23. Tracking number input auto-uppercases as you type
  24. "Report this listing" shortcut from the book detail view
  25. Cover-image gradients retoned to match the professional palette
      (no more neon green/gold)

## Deploy (same flow as before)
cp -r the contents of this folder over ~/codex-backend, then:
    git add .
    git commit -m "Remove company section, add 25 features"
    git push
No new environment variables needed. ADMIN_KEY still gates ad confirmation.

## Still true from before
Render's free-tier disk doesn't persist uploads or data.json across a
redeploy. Fine for now; swap to object storage + Postgres before this
depends on real sellers.
