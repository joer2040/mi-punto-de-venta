// Generates a fresh idempotency key per operation attempt.
// Call once on form mount (useRef or useState with lazy initializer),
// not on every render. Regenerate only after a confirmed success or explicit retry.
// Pattern: /^[A-Za-z0-9\-_.]{1,128}$/ — UUID v4 satisfies this.
export const generateIdempotencyKey = () => crypto.randomUUID()
