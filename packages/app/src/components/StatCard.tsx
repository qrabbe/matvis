import type { ReactNode } from 'react';
import { Card, Stack, Text } from '@wordpress/ui';
import { Meter } from './Meter';

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

/** A bounded progress meter with its caption underneath. */
function GoalMeter({
  current,
  target,
  label,
}: {
  current: number;
  target: number;
  label?: string;
}) {
  return (
    <Stack direction="column" gap="xs">
      <Meter
        value={current}
        max={target}
        label={label ?? 'Progress toward goal'}
      />
      {label && <Text variant="body-sm">{label}</Text>}
    </Stack>
  );
}
