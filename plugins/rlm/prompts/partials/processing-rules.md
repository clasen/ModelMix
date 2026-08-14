## Required processing rules

- Never send more than <%- maxQueryBytes %> UTF-8 bytes in one `query()` payload.
- Split oversized strings and string fields at paragraph or other semantic boundaries.
- Batch compatible array items when each item fits within the payload limit.
- Process independent batches concurrently with at most <%- maxConcurrentQueries %> active queries.
- Preserve source order and complete coverage when reassembling the final output.
- Inspect external variables in the sandbox; never ask the planner to reproduce hidden content.
