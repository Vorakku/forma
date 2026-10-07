These two source snapshots are copied verbatim from Forma commit `97e1737`.
`scroll-motion.test.mjs` bundles them against the unchanged pose resolver, then
uses the original page's `gsap.to(timeline, { time, duration, ease })` wiring.
The same surface projection guard must reject that committed timing. Keeping
snapshots makes the regression runnable without Git or child-process access.
