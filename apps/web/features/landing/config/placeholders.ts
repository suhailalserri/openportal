/**
 * apps/web/features/landing/config/placeholders.ts
 *
 * Phase 3.3. The ONLY place a made-up number is allowed on the landing
 * page. Everything else on the page is read live from the database.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PLACEHOLDER — PRE-LAUNCH TO-DO                                 │
 * │                                                                 │
 * │  PLACEHOLDER_TOTAL_USERS is NOT a real count. It exists so the  │
 * │  animated "Total users" stat can be designed and reviewed.      │
 * │  Before real launch either:                                     │
 * │    (a) replace it with a real public counter (a backend task —  │
 * │        see docs/frontend/BRANCH_AND_CI_NOTES.md, Session 3.3), or│
 * │    (b) set SHOW_TOTAL_USERS to false to hide the stat entirely. │
 * │  Showing an invented user count to real visitors is misleading. │
 * └─────────────────────────────────────────────────────────────────┘
 */

/** Invented figure for the animated "Total users" stat. NOT REAL. */
export const PLACEHOLDER_TOTAL_USERS = 1240;

/** Flip to false to hide the "Total users" stat everywhere. */
export const SHOW_TOTAL_USERS = true;
