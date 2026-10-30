# Fair-Rotation Scheduling Engine (Phase 13)

## 1. Architectural Overview & Mathematical Isolation

The **Fair-Rotation Scheduling Engine** is a mathematically pure, deterministic algorithm implemented in [`apps/api/src/services/scheduler/fair-rotation.engine.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/services/scheduler/fair-rotation.engine.ts). It decouples the combinatorial problem of load-shedding schedule generation from database persistence, I/O operations, and side effects.

### Core Architecture Principles
1. **Zero Database Dependencies**: The engine accepts pure data structures ([`FairRotationEngineInput`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/types.ts#L106-L117)) and produces pure schedule plans ([`FairRotationSchedulePlan`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/types.ts#L133-L146)). It contains no database calls, no network queries, and no ambient state.
2. **Deterministic Permutation Invariance**: Given identical inputs, the engine will always produce the identical output regardless of the memory order or array permutation of candidate feeders. This is achieved by combining equity scoring with a strict secondary lexicographical tie-breaker on `feeder.code`.
3. **Bounded Knapsack Bin-Packing**: Rather than naive greedy over-allocation, the engine utilizes a branch-and-bound subset-sum search bounded to 16 candidates ($O(2^{16})$ worst-case, typically $< 1\text{ ms}$), choosing feeder subsets that minimize shedding overage.

---

## 2. The 5 Grid Laws

The scheduling engine strictly enforces the five fundamental physical and policy grid laws specified in `docs/requirements-analysis.md` (Rules 1, 2, 3) and `docs/decisions.md` (D-01, D-04).

```
                      [Candidate Feeders Pool]
                                 │
     (Law 1)                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Exclude Critical Feeders: f.isCritical === true             │
  │ (Hospitals, Emergency Centers, Water Treatment)             │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
     (Law 2)                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Exclude Same-Day Cuts: f in alreadyCommittedFeederIds        │
  │ (No feeder cut >= 2 times in 24 hours)                      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
     (Law 3)                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Compute Multi-Factor Equity Score S_f:                      │
  │ S_f = 100*Cuts + 10*ShedHours - 0.5*min(168, RestHours)     │
  │ Deterministic Sort: S_f ASC -> feeder.code ASC             │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
     (Law 4)                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ For Each Time Slot (e.g. 60m):                              │
  │ Filter available != usedInThisSchedule                      │
  │ Branch-and-Bound Subset-Sum Bin-Packing:                    │
  │   Minimize Overage: (sum(Capacity) - TargetDeficit) >= 0    │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
     (Law 5)                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Diagnostics & Shortfall Accounting:                         │
  │ If sum(Capacity) < TargetDeficit:                           │
  │   shortfallMW = TargetDeficit - sum(Capacity)               │
  │   isDeficitSatisfied = false                                │
  └─────────────────────────────────────────────────────────────┘
```

### Law 1: Critical Infrastructure Immunity (Absolute Exemption)
* **Rule**: Feeders flagged with `isCritical: true` (e.g., Hospital feeders such as `FDR-DHN-HOSP`, water treatment, national security installations) are strictly exempt from load shedding.
* **Invariant**: Under no circumstances—even catastrophic deficit where target deficit exceeds the non-critical capacity of the fleet—can a critical feeder be allocated to any schedule slot.

### Law 2: Same-Calendar-Day Single-Cut Rule
* **Rule**: No feeder may undergo load shedding more than once within any single 24-hour calendar day.
* **Enforcement**:
  1. **Cross-Schedule Exclusion**: Any feeder present in `alreadyCommittedFeederIds` (i.e. already allocated to any published schedule on that date) is excluded upfront before slot generation.
  2. **Inter-Slot Exclusion**: Within the same schedule, once a feeder is allocated to Slot $i$, it is added to `usedInThisSchedule` and cannot be considered for any subsequent Slot $j > i$.

### Law 3: Multi-Factor Equity Scoring & Fairness Rotation
* **Rule**: Non-critical feeders rotate burden fairly according to historical shedding impact and rest duration.
* **Mathematical Formula**:
  $$\text{Equity Score } S_f = 100 \cdot N_{\text{cuts}} + 10 \cdot H_{\text{shed}} - 0.5 \cdot \min(168, T_{\text{rest}})$$
  * $N_{\text{cuts}}$: Total historical cuts recorded for the feeder (Weight: 100).
  * $H_{\text{shed}}$: Cumulative hours of load shedding experienced (Weight: 10).
  * $T_{\text{rest}}$: Elapsed idle hours since the feeder's last recorded shed event, capped at 168 hours (1 week).
* **Selection Priority**: Lower $S_f$ indicates higher priority for load shedding (i.e. feeders that have suffered fewer cuts and longer rest periods are chosen first).
* **Deterministic Tie-Breaking**: When two feeders have identical equity scores ($|S_a - S_b| \le 10^{-4}$), ties are deterministically resolved by comparing feeder codes in ascending order (`a.feeder.code.localeCompare(b.feeder.code)`).

### Law 4: Optimal Capacity Bin-Packing (Knapsack Subset-Sum)
* **Rule**: Naive greedy selection often leads to severe capacity overshoot (e.g., selecting an 11 MW feeder when a 4 MW + 6 MW combination matches the 10 MW deficit exactly).
* **Optimization Subroutine** ([`selectBestFeederSubset`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/services/scheduler/fair-rotation.engine.ts#L21-L97)):
  * Target: Find subset $F \subseteq \text{Candidates}$ such that:
    1. $\sum_{f \in F} C_f \ge D_{\text{target}}$
    2. Minimizes overage: $\left(\sum_{f \in F} C_f - D_{\text{target}}\right)$
    3. Among equal overage subsets, minimizes $\sum_{f \in F} S_f$
  * Uses a bounded branch-and-bound search over the top candidate pool (capped at 16 candidates to preserve sub-millisecond execution times).

### Law 5: Feasibility Diagnostics & Deficit Shortfall Accounting
* **Rule**: If the total capacity of all available eligible non-critical feeders is less than the requested deficit $D_{\text{target}}$:
  * The engine sheds all remaining available feeders.
  * Explicitly calculates `shortfallMW = targetDeficitMW - actualDeficitMW`.
  * Flags `isDeficitSatisfied: false` on the slot.
  * Aggregates `overallShortfallMWh` across the entire schedule window.

---

## 3. Contract Interfaces & Schemas

Defined in [`packages/shared/src/types.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/types.ts) and validated with Zod in [`packages/shared/src/validators.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/validators.ts):

### `CandidateFeederInput`
```typescript
interface CandidateFeederInput {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  isCritical: boolean;
  substationId: string;
  substationName?: string;
  zoneId?: string;
  zoneName?: string;
}
```

### `FairRotationEngineInput`
```typescript
interface FairRotationEngineInput {
  planningDate: string;          // YYYY-MM-DD
  startTime: string;             // HH:MM (24-hour format)
  endTime: string;               // HH:MM (24-hour format)
  slotDurationMinutes: number;   // 30, 60, or 120
  targetDeficitMW: number;       // Grid deficit requirement
  candidateFeeders: CandidateFeederInput[];
  alreadyCommittedFeederIds?: string[];
  historicalMetrics?: FeederUsageHistoryInput[];
  zoneFilterIds?: string[];
}
```

### `FairRotationSchedulePlan`
```typescript
interface FairRotationSchedulePlan {
  planningDate: string;
  targetDeficitMW: number;
  totalDurationMinutes: number;
  totalSlots: number;
  overallTargetMWh: number;
  overallActualMWh: number;
  overallShortfallMWh: number;
  eligibleFeedersCount: number;
  criticalExcludedCount: number;
  sameDayExcludedCount: number;
  slots: PlannedSlotOutput[];
}
```

---

## 4. Integration with SchedulerService

In [`apps/api/src/services/scheduler.service.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/services/scheduler.service.ts), `generateDraft` delegates all computation to `computeFairRotationSchedule`:

1. Queries active non-deleted feeders and historical assignments from the store.
2. Identifies all feeders committed to any published schedules for the planning date.
3. Computes cumulative historical cuts, shed hours, and last shed timestamp per feeder.
4. Executes `computeFairRotationSchedule`.
5. Persists the resulting draft schedule, slots, and slot feeder assignments within a consistent transaction or store operation.
6. Returns the persisted schedule conforming to the client contract.

---

## 5. Verification & Test Suite

The test suite in [`apps/api/src/test/runner.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/test/runner.ts) validates all 5 laws and end-to-end draft creation (Test 20a–20g, bringing the suite to **146 passed tests**):

| Test Case | Description | Expected Outcome |
| :--- | :--- | :--- |
| **20a** | Law 1: Critical Infrastructure Immunity | Hospital feeder (`FDR-HOSP-01`) excluded under 50 MW catastrophic deficit |
| **20b** | Law 2: Same-Calendar-Day Single-Cut Rule | Zero overlap between slots; feeders in `alreadyCommittedFeederIds` excluded |
| **20c** | Law 3: Multi-Factor Equity Scoring | 0-cut feeder strictly prioritized over 4-cut feeder; rest hours discounted |
| **20d** | Determinism Invariant | Shuffled candidate arrays yield identical schedule assignments and ordering |
| **20e** | Law 4: Knapsack Capacity Bin-Packing | Exact match [4.0 MW + 6.0 MW] chosen over overshoot [11.0 MW] |
| **20f** | Law 5: Shortfall & Infeasibility Diagnostics | Reports `shortfallMW = 8.0 MW`, `isDeficitSatisfied = false` when fleet depleted |
| **20g** | End-to-End Integration | `POST /api/operator/schedules/draft` generates valid multi-slot schedule with pure engine |
