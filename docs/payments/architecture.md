Payments (architecture only, no billing built)

No registration and no subscriptions, ever. One-time credit packs. A session is an anonymous id in a cookie; the sessions table holds credits. A run consumes one credit when recording starts.

Coupons: coupons table (code, percentOff, maxRedemptions). tech-europe-hackathon is seeded with 100 percent off. Redeeming attaches credit to the session.

Later, a payment gateway webhook (Convex HTTP action) will receive the gateway's own unique session id, verify the event, map it to our session in a gateway_sessions table, and add credits. Gateway id and our session id stay separate columns. Nothing else in the product needs to change for billing to arrive.
