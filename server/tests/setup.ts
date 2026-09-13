// Shared test environment setup.
// Imported first by every integration test file so that authentication has an
// explicit JWT secret (no hardcoded production fallback is used).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-phase14';
