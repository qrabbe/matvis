import { useCallback, useState } from 'react';
import { Notice } from '@wordpress/ui';
import { InlineSpinner } from '../../components/InlineSpinner';
import { ErrorNotice } from '../../components/ErrorNotice';
import { clearAdminToken } from '../../lib/adminSession';

/**
 * The console's one-shot write pattern: a button starts something, and what came
 * back is shown next to it. Every panel here does this, so it lives once.
 */

export type TaskState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

/** The wrapper in convex/admin.ts throws this when a token is stale, and it is
 * the one error worth reacting to rather than only displaying. */
const NOT_SIGNED_IN = 'Not signed in';

export function useAdminTask() {
  const [state, setState] = useState<TaskState>({ status: 'idle' });

  /** Run `work` and keep whatever line it returns, or the error it threw. A
   * stale token clears itself, which drops the console back to sign-in instead
   * of leaving every button silently failing. */
  const run = useCallback(async (work: () => Promise<string>) => {
    setState({ status: 'busy' });
    try {
      setState({ status: 'done', message: await work() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(NOT_SIGNED_IN)) clearAdminToken();
      setState({ status: 'error', message });
    }
  }, []);

  return { state, run };
}

/** What a task left behind: a spinner while it runs, then its line or its
 * error. Renders nothing before the first run. */
export function TaskResult({
  state,
  busyLabel = 'Working…',
}: {
  state: TaskState;
  busyLabel?: string;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'busy') return <InlineSpinner label={busyLabel} />;
  if (state.status === 'error') {
    return <ErrorNotice>{state.message}</ErrorNotice>;
  }
  return (
    <Notice.Root intent="success">
      <Notice.Description>{state.message}</Notice.Description>
    </Notice.Root>
  );
}
