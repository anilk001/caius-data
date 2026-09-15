/**
 * Shared query limits.
 *
 * Kept free of server-only imports so both the search layer and the tests can
 * read them — a pack larger than MAX_SEARCH_LIMIT would silently deliver a
 * short file, which is the kind of bug a buyer discovers before we do.
 */
export const MAX_SEARCH_LIMIT = 500
