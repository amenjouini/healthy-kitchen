import { useState } from 'react';
import { isoDay } from '@/utils/format';

/** Period selector state → { days, setDays, from, to } (YYYY-MM-DD, inclusive). */
export function usePeriod(initial = 30) {
  const [days, setDays] = useState(initial);
  return { days, setDays, from: isoDay(-(days - 1)), to: isoDay(0) };
}
