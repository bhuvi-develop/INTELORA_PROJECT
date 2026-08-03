import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apmService, assetService } from '@/services/platform.service';
import type {
  ApmBacklogResponse,
  ApmCostResponse,
  ApmCriticalityResponse,
  ApmEffectivenessResponse,
  ApmHierarchyResponse,
  ApmOeeInputs,
  ApmOverview,
  ApmReliabilityResponse,
  ApmWorkOrderListResponse,
} from '@/services/apm.types';

/* ───────────────────────────────────────────────────────────────────────────
 * APM data access.
 *
 * The live estate arrives through the engine store, which is a push stream and
 * carries the whole snapshot on every tick. APM is not that: its endpoints are
 * request-shaped, derived on demand from AD and PdM outputs, and expensive
 * enough that the backend recomputes them on its own cadence rather than per
 * frame. React Query is the right binding for that half of the platform, and
 * it is already mounted in `AppProviders`.
 *
 * Everything here is read-only. APM's write surface — raising, assigning and
 * signing off work orders — is a separate concern and is not mixed into the
 * query layer.
 *
 * The stale window matches the backend's own analytics cadence. Polling faster
 * than the server recomputes only produces identical payloads and re-renders.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Backend recomputes the APM snapshot on this cadence; there is no point asking sooner. */
const STALE_MS = 30_000;
const REFETCH_MS = 30_000;

/** One namespace, so a single call invalidates every APM view together. */
export const apmKeys = {
  all: ['apm'] as const,
  overview: (category?: string) => ['apm', 'overview', category ?? 'all'] as const,
  reliability: (category?: string) => ['apm', 'reliability', category ?? 'all'] as const,
  criticality: () => ['apm', 'criticality'] as const,
  cost: () => ['apm', 'cost'] as const,
  backlog: () => ['apm', 'backlog'] as const,
  effectiveness: () => ['apm', 'effectiveness'] as const,
  hierarchy: (depth?: number) => ['apm', 'hierarchy', depth ?? 99] as const,
  workOrders: (query: Record<string, unknown>) => ['apm', 'work-orders', query] as const,
  asset: (assetId: string) => ['apm', 'asset', assetId] as const,
  oeeInputs: () => ['apm', 'outputs', 'oee'] as const,
};

/**
 * Narrow a loosely-typed service response to its APM contract.
 *
 * `platform.service.ts` types most APM endpoints as `Record<string, unknown>`,
 * which is honest about what the generic `get` helper knows and useless to a
 * consumer. The contracts in `apm.types.ts` are the transcription of what the
 * server actually returns, so this is the one place the assertion is made —
 * once, named, and next to the types it asserts — rather than at every call
 * site reaching into an untyped bag.
 */
const narrow = <T,>(promise: Promise<Record<string, unknown>>): Promise<T> =>
  promise as unknown as Promise<T>;

const shared = {
  staleTime: STALE_MS,
  refetchInterval: REFETCH_MS,
  /* A failed poll leaves the last good payload on screen. An operator staring
   * at a stale dashboard that admits it is stale learns more than one staring
   * at a blank panel. */
  placeholderData: <T,>(previous: T | undefined) => previous,
} as const;

/**
 * The whole APM estate view.
 *
 * One request carries the per-asset records, the fleet rollups, the economics,
 * the backlog and the distributions — so the dashboard makes a single call
 * rather than eight, and every card on it is guaranteed to be describing the
 * same instant.
 */
export const useApmOverview = (category?: string): UseQueryResult<ApmOverview> =>
  useQuery({
    queryKey: apmKeys.overview(category),
    queryFn: ({ signal }) => apmService.overview(category ? { category } : {}, { signal }),
    ...shared,
  });

export const useApmReliability = (category?: string): UseQueryResult<ApmReliabilityResponse> =>
  useQuery({
    queryKey: apmKeys.reliability(category),
    queryFn: ({ signal }) =>
      narrow<ApmReliabilityResponse>(apmService.reliability(category ? { category } : {}, { signal })),
    ...shared,
  });

export const useApmCriticality = (): UseQueryResult<ApmCriticalityResponse> =>
  useQuery({
    queryKey: apmKeys.criticality(),
    queryFn: ({ signal }) => narrow<ApmCriticalityResponse>(apmService.criticality({ signal })),
    ...shared,
  });

export const useApmCost = (): UseQueryResult<ApmCostResponse> =>
  useQuery({
    queryKey: apmKeys.cost(),
    queryFn: ({ signal }) => narrow<ApmCostResponse>(apmService.cost({ signal })),
    ...shared,
  });

export const useApmBacklog = (): UseQueryResult<ApmBacklogResponse> =>
  useQuery({
    queryKey: apmKeys.backlog(),
    queryFn: ({ signal }) => narrow<ApmBacklogResponse>(apmService.backlog({ signal })),
    ...shared,
  });

export const useApmEffectiveness = (): UseQueryResult<ApmEffectivenessResponse> =>
  useQuery({
    queryKey: apmKeys.effectiveness(),
    queryFn: ({ signal }) => narrow<ApmEffectivenessResponse>(apmService.effectiveness({ signal })),
    ...shared,
  });

export const useApmHierarchy = (depth?: number): UseQueryResult<ApmHierarchyResponse> =>
  useQuery({
    queryKey: apmKeys.hierarchy(depth),
    queryFn: ({ signal }) =>
      narrow<ApmHierarchyResponse>(apmService.hierarchy(depth ? { depth } : {}, { signal })),
    ...shared,
  });

export const useApmWorkOrders = (
  query: Parameters<typeof apmService.workOrders>[0] = {},
): UseQueryResult<ApmWorkOrderListResponse> =>
  useQuery({
    queryKey: apmKeys.workOrders(query as Record<string, unknown>),
    queryFn: ({ signal }) => narrow<ApmWorkOrderListResponse>(apmService.workOrders(query, { signal })),
    ...shared,
  });

export const useApmAsset = (assetId: string | undefined) =>
  useQuery({
    queryKey: apmKeys.asset(assetId ?? ''),
    queryFn: ({ signal }) => apmService.asset(assetId as string, { signal }),
    enabled: Boolean(assetId),
    ...shared,
  });

/**
 * The contract APM publishes for OEE.
 *
 * Nothing in this application renders it yet — OEE is not built. It is exposed
 * as a hook anyway so the downstream module has a typed seam to build against
 * on day one rather than discovering the shape by inspection.
 */
export const useApmOeeInputs = (): UseQueryResult<ApmOeeInputs> =>
  useQuery({
    queryKey: apmKeys.oeeInputs(),
    queryFn: ({ signal }) => narrow<ApmOeeInputs>(apmService.oeeInputs({ signal })),
    ...shared,
  });

export const useApmWorkOrderMutations = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: apmKeys.all });

  const raise = useMutation<Record<string, unknown>, Error, Record<string, unknown>>({
    mutationFn: (payload) => apmService.raiseWorkOrder(payload),
    onSuccess: invalidate,
  });

  const approve = useMutation<Record<string, unknown>, Error, { id: string; approver: string; note?: string }>({
    mutationFn: ({ id, approver, note }) => apmService.approveWorkOrder(id, { approver, note }),
    onSuccess: invalidate,
  });

  const assign = useMutation<Record<string, unknown>, Error, { id: string; technician: string; assigned_by: string; scheduled_for?: string }>({
    mutationFn: ({ id, technician, assigned_by, scheduled_for }) =>
      apmService.assignWorkOrder(id, { technician, assigned_by, scheduled_for }),
    onSuccess: invalidate,
  });

  const complete = useMutation<Record<string, unknown>, Error, { id: string; completed_by: string; actual_hours?: number; actual_cost?: number; failure_cause?: string; notes?: string }>({
    mutationFn: ({ id, completed_by, actual_hours, actual_cost, failure_cause, notes }) =>
      apmService.completeWorkOrder(id, { completed_by, actual_hours, actual_cost, failure_cause, notes }),
    onSuccess: invalidate,
  });

  const verify = useMutation<Record<string, unknown>, Error, { id: string; verifier: string; passed: boolean; notes?: string }>({
    mutationFn: ({ id, verifier, passed, notes }) => apmService.verifyWorkOrder(id, { verifier, passed, notes }),
    onSuccess: invalidate,
  });

  return { raise, approve, assign, complete, verify };
};

export const useCreateAssetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<Record<string, unknown>, Error, Parameters<typeof assetService.create>[0]>({
    mutationFn: (payload) => assetService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apmKeys.all });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
};
