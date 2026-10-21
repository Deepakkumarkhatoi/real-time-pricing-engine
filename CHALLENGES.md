# Challenges Faced — template

Complete this document with results from your own test run; do not claim measurements you have not taken.

| Challenge | Approach | Evidence / follow-up |
|---|---|---|
| Provider authentication response varies | Isolate response detection in `src/upstream.ts` | Record sanitized response shape and final condition used |
| Provider tick envelope varies | Isolate parsing in `src/normalizer.ts` | Add a sanitized fixture and a unit test |
| Out-of-order / duplicate ticks | Timestamp-sorted samples and duplicate timestamp rejection | Add tests with real provider edge cases |
| Recovery after restart | Redis snapshots and state restoration | Restart app and verify state restored; measure potential lost ticks |
| Large updates / slow clients | Compact JSON, compression, bounded client buffer | Measure payload size and latency under load |
| Rolling-window computation cost | Current implementation scans retained samples | Benchmark and replace with monotonic queues/indexed structures if needed |
