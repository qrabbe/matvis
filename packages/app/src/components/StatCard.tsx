import type { ReactNode } from 'react';
import { Card, Stack, Text } from '@wordpress/ui';
import { CHART_CHROME } from './chartTheme';

/**
 * A headline number with its label and optional supporting detail.
 *
 * Deliberately not a chart: a single value's job is to be read, not compared, so
 * it gets typographic hierarchy rather than a plot. Charts start where a second
 * value does.
 *
 * `goal` draws a progress meter beneath the value. It renders as a meter, not as
 * a judgement — see the Nutrition tab, where the protein goal is labelled "goal"
 * and never as advice.
 */
export function StatCard({
  label,
  value,
  sub,
  goal,
  trend,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  /** Small supporting line under the value, e.g. a date range. */
  sub?: string;
  /** Optional progress meter: `value / target`, both in the same unit. */
  goal?: { current: number; target: number; label?: string };
  /** A `TrendBadge`, or anything else that belongs beside the label. */
  trend?: ReactNode;
  /** `caution` tints the value, for a number the user should notice. */
  tone?: 'neutral' | 'caution';
}) {
  return (
    <Card.Root>
      <Card.Content>
        <Stack direction="column" gap="xs">
          <Stack
            direction="row"
            gap="sm"
            justify="space-between"
            align="center"
          >
            <Text variant="body-sm">{label}</Text>
            {trend}
          </Stack>
          <Text
            variant="heading-lg"
            style={
              tone === 'caution'
                ? {
                    color:
                      'var(--wpds-color-foreground-content-caution, #c6a800)',
                  }
                : undefined
            }
          >
            {value}
          </Text>
          {sub && <Text variant="body-sm">{sub}</Text>}
          {goal && <GoalMeter {...goal} />}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

/** A bounded progress meter. Uses the native `<progress>` semantics via ARIA on
 * a div, so a screen reader announces the ratio rather than reading a bare
 * decoration. */
function GoalMeter({
  current,
  target,
  label,
}: {
  current: number;
  target: number;
  label?: string;
}) {
  const ratio = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  return (
    <Stack direction="column" gap="xs">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={current}
        aria-label={label ?? 'Progress toward goal'}
        style={{
          height: 6,
          borderRadius: 3,
          background: CHART_CHROME.grid,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            borderRadius: 3,
            background:
              'var(--wpds-color-background-interactive-brand-strong, #435ab8)',
          }}
        />
      </div>
      {label && <Text variant="body-sm">{label}</Text>}
    </Stack>
  );
}
