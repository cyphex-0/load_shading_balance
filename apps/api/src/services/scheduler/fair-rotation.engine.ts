import {
  CandidateFeederInput,
  FeederUsageHistoryInput,
  FairRotationEngineInput,
  AllocatedFeederSlotItem,
  PlannedSlotOutput,
  FairRotationSchedulePlan,
  fairRotationEngineInputSchema
} from '@load-shedding/shared';
import { AppError } from '../../utils/response';

interface ScoredCandidate {
  feeder: CandidateFeederInput;
  equityScore: number;
}

/**
 * Deterministically packs feeders to meet or exceed targetDeficitMW with minimal overage.
 * Prioritizes feeders with lower equity scores (higher equity priority).
 */
export function selectBestFeederSubset(
  candidates: ScoredCandidate[],
  targetDeficitMW: number
): ScoredCandidate[] {
  if (candidates.length === 0) return [];

  const totalAvailableMW = candidates.reduce((sum, c) => sum + c.feeder.capacityMW, 0);

  // If available capacity cannot meet deficit, allocate all available feeders (shortfall)
  if (totalAvailableMW <= targetDeficitMW) {
    return [...candidates];
  }

  // Candidates are already sorted by equityScore ascending, then code ascending.
  // We seek a subset that satisfies:
  // 1. sum(capacity) >= targetDeficitMW
  // 2. minimizes (sum(capacity) - targetDeficitMW)
  // 3. among minimal overage, minimizes average equityScore
  //
  // Use a branch-and-bound search over candidate subset with depth limit to guarantee O(1) bounded execution
  const MAX_BRANCH_CANDIDATES = Math.min(candidates.length, 16);
  const searchPool = candidates.slice(0, MAX_BRANCH_CANDIDATES);

  let bestSubset: ScoredCandidate[] = [];
  let minOverage = Infinity;
  let bestScoreSum = Infinity;

  // Standard greedy baseline
  let greedyAccum = 0;
  const greedyBaseline: ScoredCandidate[] = [];
  for (const c of searchPool) {
    greedyBaseline.push(c);
    greedyAccum += c.feeder.capacityMW;
    if (greedyAccum >= targetDeficitMW) {
      break;
    }
  }

  if (greedyAccum >= targetDeficitMW) {
    bestSubset = greedyBaseline;
    minOverage = greedyAccum - targetDeficitMW;
    bestScoreSum = greedyBaseline.reduce((acc, c) => acc + c.equityScore, 0);
  }

  // Branch and bound search for exact or closer match
  function search(index: number, currentSubset: ScoredCandidate[], currentCapacity: number, currentScore: number) {
    // If current capacity meets target
    if (currentCapacity >= targetDeficitMW) {
      const overage = currentCapacity - targetDeficitMW;
      if (
        overage < minOverage - 1e-4 ||
        (Math.abs(overage - minOverage) <= 1e-4 && currentScore < bestScoreSum)
      ) {
        minOverage = overage;
        bestScoreSum = currentScore;
        bestSubset = [...currentSubset];
      }
      return; // No need to add more feeders to this branch
    }

    // Prune if even adding all remaining feeders cannot beat minOverage
    if (index >= searchPool.length) return;

    // Option 1: Include searchPool[index]
    const item = searchPool[index];
    currentSubset.push(item);
    search(index + 1, currentSubset, currentCapacity + item.feeder.capacityMW, currentScore + item.equityScore);
    currentSubset.pop();

    // Option 2: Exclude searchPool[index]
    search(index + 1, currentSubset, currentCapacity, currentScore);
  }

  search(0, [], 0, 0);

  return bestSubset.length > 0 ? bestSubset : greedyBaseline;
}

/**
 * Pure, deterministic mathematical load-shedding scheduling engine.
 *
 * Implements the 5 Grid Laws:
 * - Law 1: Critical Infrastructure Immunity (isCritical === true are strictly excluded)
 * - Law 2: Same-Calendar-Day No-Double-Cut Rule (never cut >= 2 times in 24h)
 * - Law 3: Multi-Factor Equity Scoring + Strict Lexicographical Tie-Breaking
 * - Law 4: Optimal Capacity Bin-Packing (minimal overage subset-sum)
 * - Law 5: Explicit Feasibility & Deficit Shortfall Accounting
 */
export function computeFairRotationSchedule(
  input: FairRotationEngineInput
): FairRotationSchedulePlan {
  // Validate schema
  const data = fairRotationEngineInputSchema.parse(input);

  // 1. Timeline Discretization
  const [startH, startM] = data.startTime.split(':').map(Number);
  const [endH, endM] = data.endTime.split(':').map(Number);
  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;

  if (endTotalMinutes <= startTotalMinutes) {
    throw new AppError('End time must be after start time', 400, 'INVALID_TIME_RANGE');
  }

  const totalDurationMinutes = endTotalMinutes - startTotalMinutes;
  const totalSlots = Math.ceil(totalDurationMinutes / data.slotDurationMinutes);

  // 2. Candidate Filtering
  let candidates = [...data.candidateFeeders];

  // Optional zone filtering
  if (data.zoneFilterIds && data.zoneFilterIds.length > 0) {
    const filterSet = new Set(data.zoneFilterIds);
    candidates = candidates.filter((f) => f.zoneId && filterSet.has(f.zoneId));
  }

  // Law 1: Hard filter out critical feeders (hospitals, emergency centers)
  const criticalFeeders = candidates.filter((f) => f.isCritical);
  const nonCriticalFeeders = candidates.filter((f) => !f.isCritical);

  // Law 2: Hard filter out feeders already committed to other schedules on the same calendar day
  const committedSet = new Set(data.alreadyCommittedFeederIds || []);
  const sameDayExcluded = nonCriticalFeeders.filter((f) => committedSet.has(f.id));
  const availablePool = nonCriticalFeeders.filter((f) => !committedSet.has(f.id));

  // 3. Multi-Factor Equity Scoring (Law 3)
  const historyMap = new Map<string, FeederUsageHistoryInput>();
  if (data.historicalMetrics) {
    for (const h of data.historicalMetrics) {
      historyMap.set(h.feederId, h);
    }
  }

  // Parse reference schedule date for rest hours calculation
  const scheduleStartTimeMs = new Date(`${data.planningDate}T${data.startTime}:00.000Z`).getTime();

  const scoredCandidates: ScoredCandidate[] = availablePool.map((feeder) => {
    const history = historyMap.get(feeder.id);
    const totalCutsCount = history?.totalCutsCount ?? 0;
    const cumulativeShedHours = history?.cumulativeShedHours ?? 0;

    let restHours = 168; // Default to 1 week idle time if no previous cut recorded
    if (history?.lastShedAt) {
      const lastCutMs = new Date(history.lastShedAt).getTime();
      const diffHours = (scheduleStartTimeMs - lastCutMs) / (1000 * 60 * 60);
      if (!isNaN(diffHours) && diffHours > 0) {
        restHours = diffHours;
      }
    }

    // Equity Score formula: lower is prioritized
    // Weight 1: total cuts (100 per cut)
    // Weight 2: cumulative shed hours (10 per hour)
    // Weight 3: rest hours discount (0.5 per idle hour up to 168h)
    const equityScore =
      totalCutsCount * 100 +
      cumulativeShedHours * 10 -
      Math.min(168, restHours) * 0.5;

    return {
      feeder,
      equityScore: Math.round(equityScore * 100) / 100
    };
  });

  // Deterministic primary sort: equityScore ascending; secondary tie-breaker: feeder.code ascending
  scoredCandidates.sort((a, b) => {
    if (Math.abs(a.equityScore - b.equityScore) > 1e-4) {
      return a.equityScore - b.equityScore;
    }
    return a.feeder.code.localeCompare(b.feeder.code);
  });

  // 4. Slot Generation & Bin-Packing (Laws 2 & 4)
  const usedInThisSchedule = new Set<string>();
  const plannedSlots: PlannedSlotOutput[] = [];

  let overallTargetMWh = 0;
  let overallActualMWh = 0;
  let overallShortfallMWh = 0;

  for (let i = 0; i < totalSlots; i++) {
    const slotStartMin = startTotalMinutes + i * data.slotDurationMinutes;
    const slotEndMin = Math.min(startTotalMinutes + (i + 1) * data.slotDurationMinutes, endTotalMinutes);
    const slotDurationHours = (slotEndMin - slotStartMin) / 60;

    const startHStr = Math.floor(slotStartMin / 60).toString().padStart(2, '0');
    const startMStr = (slotStartMin % 60).toString().padStart(2, '0');
    const endHStr = Math.floor(slotEndMin / 60).toString().padStart(2, '0');
    const endMStr = (slotEndMin % 60).toString().padStart(2, '0');

    const startTimeISO = new Date(`${data.planningDate}T${startHStr}:${startMStr}:00.000Z`).toISOString();
    const endTimeISO = new Date(`${data.planningDate}T${endHStr}:${endMStr}:00.000Z`).toISOString();

    // Eligible candidates for this slot: must NOT have been used in earlier slots of this schedule
    const slotCandidates = scoredCandidates.filter((sc) => !usedInThisSchedule.has(sc.feeder.id));

    // Law 4: Optimal Capacity Bin-Packing
    const selectedSubset = selectBestFeederSubset(slotCandidates, data.targetDeficitMW);

    let slotActualMW = 0;
    const allocatedFeeders: AllocatedFeederSlotItem[] = [];

    for (const item of selectedSubset) {
      usedInThisSchedule.add(item.feeder.id);
      slotActualMW += item.feeder.capacityMW;
      allocatedFeeders.push({
        feederId: item.feeder.id,
        name: item.feeder.name,
        code: item.feeder.code,
        capacityMW: item.feeder.capacityMW,
        substationName: item.feeder.substationName,
        zoneName: item.feeder.zoneName || 'Unknown Zone',
        equityScore: item.equityScore
      });
    }

    const roundedActualMW = Math.round(slotActualMW * 10) / 10;
    const shortfallMW = Math.max(0, Math.round((data.targetDeficitMW - roundedActualMW) * 10) / 10);
    const isDeficitSatisfied = roundedActualMW >= data.targetDeficitMW;

    overallTargetMWh += data.targetDeficitMW * slotDurationHours;
    overallActualMWh += roundedActualMW * slotDurationHours;
    overallShortfallMWh += shortfallMW * slotDurationHours;

    plannedSlots.push({
      slotIndex: i + 1,
      startTime: startTimeISO,
      endTime: endTimeISO,
      targetDeficitMW: data.targetDeficitMW,
      actualDeficitMW: roundedActualMW,
      shortfallMW,
      isDeficitSatisfied,
      assignedFeeders: allocatedFeeders
    });
  }

  return {
    planningDate: data.planningDate,
    targetDeficitMW: data.targetDeficitMW,
    totalDurationMinutes,
    totalSlots,
    overallTargetMWh: Math.round(overallTargetMWh * 10) / 10,
    overallActualMWh: Math.round(overallActualMWh * 10) / 10,
    overallShortfallMWh: Math.round(overallShortfallMWh * 10) / 10,
    eligibleFeedersCount: scoredCandidates.length,
    criticalExcludedCount: criticalFeeders.length,
    sameDayExcludedCount: sameDayExcluded.length,
    slots: plannedSlots
  };
}
