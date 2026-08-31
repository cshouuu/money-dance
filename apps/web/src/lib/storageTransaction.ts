export interface ReversibleStorageStep {
  write: () => boolean
  rollback: () => void
}

export interface StorageTransactionResult {
  success: boolean
  failedStep: number | null
}

/**
 * Runs synchronous local-storage writes as one logical operation. Previously
 * completed steps are restored in reverse order when a later write fails.
 */
export function runReversibleStorageTransaction(
  steps: readonly ReversibleStorageStep[],
): StorageTransactionResult {
  const completed: ReversibleStorageStep[] = []
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!
    let written = false
    try {
      written = step.write()
    } catch {
      written = false
    }
    if (written) {
      completed.push(step)
      continue
    }
    // A storage wrapper can report failure after a partially applied write.
    // Restore the failing step as well before unwinding earlier writes.
    try {
      step.rollback()
    } catch {
      // A retry with the same logical ID repairs any remaining partial state.
    }
    for (const committed of completed.reverse()) {
      try {
        committed.rollback()
      } catch {
        // A retry uses the same stable session ID and repairs partial state.
      }
    }
    return { success: false, failedStep: index }
  }
  return { success: true, failedStep: null }
}
