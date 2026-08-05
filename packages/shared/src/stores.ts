import { z } from 'zod';

export const STORES = [
  'ica',
  'coop',
  'willys',
  'hemkop',
  'lidl',
  'citygross',
  'tempo',
  'matoppet',
  'handlarn',
  'netto',
] as const;

export type StoreSlug = (typeof STORES)[number];

export const STORE_LABELS: Record<StoreSlug, string> = {
  ica: 'ICA',
  coop: 'Coop',
  willys: 'Willys',
  hemkop: 'Hemköp',
  lidl: 'Lidl',
  citygross: 'City Gross',
  tempo: 'Tempo',
  matoppet: 'Matöppet',
  handlarn: 'Handlarn',
  netto: 'Netto',
};

export const ReceiptSource = z.enum(STORES);
export type ReceiptSource = z.infer<typeof ReceiptSource>;
