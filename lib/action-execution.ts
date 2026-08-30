export const ACTION_STATUSES = ["pending", "in_progress", "completed"] as const;
export type ActionStatus = typeof ACTION_STATUSES[number];

export interface ActionExecutionState {
  status?: unknown;
  done?: unknown;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
}

export interface ActionExecutionTransition {
  status: ActionStatus;
  done: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeActionStatus(action: ActionExecutionState): ActionStatus {
  if (ACTION_STATUSES.includes(action.status as ActionStatus)) return action.status as ActionStatus;
  return action.done === true ? "completed" : "pending";
}

export function transitionActionStatus(
  current: ActionExecutionState,
  target: ActionStatus,
  now = new Date(),
): ActionExecutionTransition {
  const currentStatus = normalizeActionStatus(current);
  let startedAt = asDate(current.startedAt);
  let completedAt = asDate(current.completedAt);

  if (target === currentStatus) {
    return { status: target, done: target === "completed", startedAt, completedAt };
  }

  if (target === "pending") {
    // Volver a pendiente reinicia el ciclo operativo; la transición previa queda en AuditLog.
    startedAt = null;
    completedAt = null;
  } else if (target === "in_progress") {
    startedAt ||= now;
    completedAt = null;
  } else {
    completedAt = now;
  }

  return { status: target, done: target === "completed", startedAt, completedAt };
}

export function actionProgress<T extends ActionExecutionState>(visibleActions: T[]) {
  const total = visibleActions.length;
  const completed = visibleActions.filter((action) => normalizeActionStatus(action) === "completed").length;
  return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 };
}
