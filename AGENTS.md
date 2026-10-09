# FORMA agent rules

## Testing effort

These rules reflect the owner's preference and override blanket testing requirements in ancestor `AGENTS.md` files for work in this repository.

- Write or run unit tests only for difficult tasks: complex logic, subtle bugs, state transitions, data handling, or changes with a meaningful regression risk.
- For simple styling, layout, copy, button placement/removal, and straightforward UI changes that the owner can review visually, skip automated tests unless explicitly requested. Let the owner review the result.
- Do not automatically run the full unit or browser suite, typecheck, or production build for every small change. Use a focused check only when it helps verify the actual change.
- For difficult tasks, test the affected behavior first. Run broader suites only when the scope or an unresolved failure justifies them, or the owner asks.
- Keep verification concise and avoid repeated checks that add no useful evidence. State what was checked and what was left for the owner's review; never claim that skipped tests passed.
