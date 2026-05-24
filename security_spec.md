# PriceGuard Security Specification

## Data Invariants
1. A product must always belong to a user.
2. A user can only read/write their own products and invoices.
3. Prices must be positive numbers.
4. Product names must be strings.

## The Dirty Dozen Payloads (Rejection Targets)
1. **Malicious Ownership**: Create a product with `userId` of another user.
2. **Shadow Update**: Update a product with an extra field `isAdmin: true`.
3. **Negative Price**: Set `currentPrice` to -1.
4. **Invalid ID**: Document ID with 2KB string.
5. **Orphaned Invoice**: Create an invoice with `userId` that doesn't match authenticated user.
6. **Price Spoofing**: Update `previousPrice` to a fake lower value to hide a price hike.
7. **Cross-User Leak**: Attempt to list invoices where `userId` != `request.auth.uid`.
8. **Resource Exhaustion**: Massive 1MB string in product name.
9. **Identity Integrity**: Update a product's `userId` field to something else.
10. **Terminal State Bypass**: (N/A for this app, but if we had 'confirmed' status, we'd block changes).
11. **Email Spoofing**: Accessing data with an unverified email (if we enforce verification).
12. **Blanket Query**: Querying all products without a `where('userId', '==', uid)` clause.

## Firestore Rules Draft
I will now create the global safety net and helpers.
