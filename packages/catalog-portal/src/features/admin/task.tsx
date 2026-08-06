import { useCallback, useState } from 'react';
import { Notice } from '@wordpress/ui';
import { ErrorNotice, InlineSpinner } from '@matvis/ui';
import { clearAdminToken } from '../../lib/adminSession';

export type TaskState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const NOT_SIGNED_IN = 'Not signed in';

export function useAdminTask() {
  const [state, setState] = useState<TaskState>({ status: 'idle' });

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
