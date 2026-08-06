import type { ReactNode } from 'react';
import { Card, Stack, Text } from '@wordpress/ui';
import { Meter } from './Meter';

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
  sub?: string;
  goal?: { current: number; target: number; label?: string };
  trend?: ReactNode;
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
