# State

> Last updated: 2026-04-19

## System State Diagram

```mermaid
stateDiagram-v2
    [*] --> Planning: project started
    Planning --> Setup: plan approved
    Setup --> Building: environment ready
    Building --> Testing: features complete
    Testing --> Deploying: tests pass
    Deploying --> Live: deployed
    
    note right of Planning: ← WE ARE HERE
```

Update this diagram as the project progresses. Move the `← WE ARE HERE` marker. Add substates for complex phases.

## Component Status

| Component | Status | Notes |
|-----------|--------|-------|
| [Component 1] | ⏳ Not started | |
| [Component 2] | ⏳ Not started | |
| [Component 3] | ⏳ Not started | |

Status markers:
- ⏳ Not started
- 🔧 In progress
- ✅ Done
- 🚫 Blocked — note why
- ⚠️ Needs attention

## Data Flow

```mermaid
flowchart LR
    A[Input] --> B[Process]
    B --> C[Output]
```

Add a data flow or architecture diagram when the system has multiple components that interact.

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| [External API / service] | [Working / Down / Not set up] | |
| [Database] | | |

<!--
Keep this file as the single source of truth for "where are we?"
The /status command reads this file.
-->
