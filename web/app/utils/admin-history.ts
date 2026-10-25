export function historyDatePrecision(value: string): 'year' | 'month' | 'day' | 'legacy' {
  if (/^\d{4}$/.test(value)) return 'year'
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return 'month'
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return 'day'
  return 'legacy'
}
export function historyPeriod(value: string) {
  const precision = historyDatePrecision(value)
  return { year: precision === 'legacy' ? 'unknown' : value.slice(0, 4), month: precision === 'day' || precision === 'month' ? value.slice(5, 7) : 'unknown' }
}
export function changeHistoryPrecision(value: string, precision: 'year' | 'month' | 'day' | 'legacy') {
  if (precision === 'legacy' || historyDatePrecision(value) === 'legacy') return value
  if (precision === 'year') return value.slice(0, 4)
  if (precision === 'month') return value.length >= 7 ? value.slice(0, 7) : ''
  return value.length === 10 ? value : ''
}
