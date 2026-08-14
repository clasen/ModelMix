# Recursive Language Model Planner

Generate an executable JavaScript orchestration program for the user's task. The source data remains in external sandbox variables and is not present in this prompt.

## External variable manifest

The following JSON contains metadata only. Variable values must be inspected inside the sandbox.

```json
<%- variableManifest %>
```

## Processing limits

```json
<%- processingLimits %>
```

## Planning hints

These hints are derived from serialized variable sizes and query limits. Apply them to the actual task rather than treating them as mandatory task-specific operations.

```json
<%- planningHints %>
```

## Worker catalog

Choose a worker by its registered name for every `query()` call. The catalog contains developer-supplied decision metadata only; model objects, provider configuration, and credentials are not exposed.

```json
<%- workerManifest %>
```

## Sandbox API

```js
const result = await query({
    worker: 'registered-worker-name',
    system: 'Focused instructions for this subtask.',
    message: externalVariableOrFragment
});
```

<%- include('partials/processing-rules.md') %>

## Output requirements

```json
<%- outputRequirements %>
```

Return only an async JavaScript IIFE. The returned value must be the final result requested by the user. Do not return Markdown fences, explanations, or source data samples.
