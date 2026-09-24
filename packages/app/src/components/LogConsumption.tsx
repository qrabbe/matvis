import { useMemo, useState } from 'react';
import { Button, Card, InputControl, Stack, Text } from '@wordpress/ui';
import { dayKey } from '../lib/format';

export interface LoggableProduct {
  ean: string;
  name: string;
}

const MAX_SUGGESTIONS = 8;

/** The one interaction for saying "I used this" — a product search (over the
 * account's own purchase history, not a food database) plus a quantity and a
 * date, used both prefilled from a Pantry row and as a standalone entry
 * point. Nothing here needs to know which specific purchase it depletes —
 * that's computed later by `allocateConsumption`. */
export function LogConsumption({
  products,
  initialEan,
  onLog,
  onDone,
}: {
  products: readonly LoggableProduct[];
  initialEan?: string;
  onLog: (ean: string, quantity: number, consumedAt: number) => Promise<void>;
  onDone?: () => void;
}) {
  const initial = initialEan
    ? (products.find((p) => p.ean === initialEan) ?? null)
    : null;
  const [selected, setSelected] = useState<LoggableProduct | null>(initial);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(term))
      .slice(0, MAX_SUGGESTIONS);
  }, [products, query]);

  const submit = async () => {
    if (!selected) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }
    const consumedAt = new Date(`${date}T12:00:00`).getTime();
    setBusy(true);
    setError(null);
    try {
      await onLog(selected.ean, parsedQuantity, consumedAt);
      setSelected(initial);
      setQuery('');
      setQuantity('1');
      setDate(dayKey(new Date()));
      onDone?.();
    } catch {
      setError('Could not log that — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="column" gap="sm">
      {selected ? (
        <Stack direction="row" gap="sm" align="center" justify="space-between">
          <Text variant="body-md">{selected.name}</Text>
          {!initialEan && (
            <Button
              variant="minimal"
              size="compact"
              onClick={() => setSelected(null)}
            >
              Change
            </Button>
          )}
        </Stack>
      ) : (
        <Stack direction="column" gap="xs">
          <InputControl
            label="Product"
            placeholder="Search what you've bought…"
            size="compact"
            value={query}
            onValueChange={setQuery}
          />
          {suggestions.length > 0 && (
            <Card.Root>
              <Card.Content>
                <Stack direction="column" gap="xs">
                  {suggestions.map((product) => (
                    <Button
                      key={product.ean}
                      variant="minimal"
                      size="compact"
                      onClick={() => {
                        setSelected(product);
                        setQuery('');
                      }}
                    >
                      {product.name}
                    </Button>
                  ))}
                </Stack>
              </Card.Content>
            </Card.Root>
          )}
        </Stack>
      )}

      <Stack direction="row" gap="sm" align="end" wrap="wrap">
        <InputControl
          type="number"
          label="Quantity"
          size="compact"
          value={quantity}
          onValueChange={setQuantity}
          style={{ maxWidth: 100 }}
        />
        <InputControl
          type="date"
          label="Consumed on"
          size="compact"
          value={date}
          onValueChange={setDate}
        />
        <Button
          disabled={!selected || busy}
          loading={busy}
          onClick={() => void submit()}
        >
          Log it
        </Button>
      </Stack>

      {error && (
        <Text
          variant="body-sm"
          style={{
            color: 'var(--wpds-color-foreground-content-critical, #d33)',
          }}
        >
          {error}
        </Text>
      )}
    </Stack>
  );
}
