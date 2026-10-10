---
description: Strict scope isolation and regression protection for Can-Ride
alwaysApply: true
---

# STRICT CHANGE SCOPE & REGRESSION PROTECTION

You are working on a large production-grade application consisting of:
- Passenger Flutter App
- Driver Flutter App
- Admin Panel
- NestJS Backend
- Shared Flutter packages
- Shared UI components and services

## RULE 1 — CHANGE ONLY WHAT IS REQUESTED

- Modify ONLY the functionality explicitly requested.
- Never redesign, refactor, or modify unrelated screens.
- Never make opportunistic improvements.
- Never change unrelated UI, layout, colors, fonts, navigation, or business logic.
- Existing functionality must remain unchanged unless explicitly authorized.

## RULE 2 — MANDATORY IMPACT ANALYSIS

Before editing:

1. Identify the exact requested feature.
2. Identify the target files.
3. Identify all shared dependencies.
4. Identify other screens consuming those dependencies.
5. Determine whether a proposed change could affect unrelated screens.
6. Establish a list of allowed files and protected files.

Do not edit until this analysis is complete.

## RULE 3 — FILE ALLOWLIST

Create a task-specific file allowlist.

- Only allowlisted files may be modified.
- Treat all other files as read-only.
- If another file requires modification, STOP and request approval.
- Never silently expand the allowed scope.
- Never perform unrelated cleanup or formatting.

## RULE 4 — SHARED COMPONENT PROTECTION

Shared components include:
- Widgets
- Themes
- Typography
- Colors
- Navigation
- State management
- API clients
- Authentication
- Reusable services
- Database schemas

Never modify a shared component without analyzing every known consumer.

If a shared component needs a feature-specific change:
- Prefer local composition or configuration.
- Preserve existing behavior for other consumers.
- Never introduce breaking changes.
- Request approval before changing shared code outside the allowlist.

## RULE 5 — NO UNREQUESTED REFACTORING

Do not:
- Rename unrelated files or classes.
- Reorganize directories.
- Replace existing architecture.
- Rewrite working code.
- Change global styles.
- Change dependencies.
- Modify unrelated API contracts.
- Change database schemas without approval.

## RULE 6 — PRESERVE EXISTING FEATURES

All existing screens and functionality are protected by default.

For every change:
- Preserve current navigation.
- Preserve existing validation.
- Preserve existing business logic.
- Preserve API compatibility.
- Preserve responsive behavior.
- Preserve platform-specific behavior.

## RULE 7 — IMPLEMENTATION WORKFLOW

Phase A: Inspect
- Read relevant files.
- Trace dependencies.
- Identify impacted consumers.

Phase B: Plan
- Explain proposed modifications.
- List exact allowed files.
- Identify risks.
- Request approval for scope expansion.

Phase C: Implement
- Make the smallest possible changes.
- Do not touch unrelated code.

Phase D: Validate
- Review git diff.
- Verify changed files against allowlist.
- Run relevant static analysis and tests.
- Test the target feature.
- Run regression checks for affected consumers.

Phase E: Report
Provide:
- Modified files
- Reason for each modification
- Screens potentially affected
- Tests performed and results
- Remaining risks

## RULE 8 — HARD STOP CONDITIONS

STOP and request permission if:
- An unrelated screen requires modification.
- A shared component needs a breaking change.
- An API contract needs changing.
- A database migration is required.
- The requested change impacts another app.
- The scope cannot be safely isolated.

Never interpret a broad instruction as permission to change unrelated functionality.

## RULE 9 — NO FALSE SUCCESS CLAIMS

Never claim that unrelated screens are unaffected unless supported by dependency analysis and relevant tests.

If tests were not run, explicitly report them as not run.

## RULE 10 — FINAL SCOPE VERIFICATION

Before completing:
- Check git diff --name-only.
- Compare changed files with the approved allowlist.
- Review all modifications for accidental changes.
- Flag any unauthorized modifications.
- Do not discard pre-existing user changes.
- Do not automatically revert unrelated work.

SUCCESS CRITERIA:
Only approved functionality changes, existing behavior is preserved, and no unauthorized files are modified.
