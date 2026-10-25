import { expect,it } from 'vitest'
import { historyPeriod,historyDatePrecision,changeHistoryPrecision } from '../app/utils/admin-history'
it('groups year, month and day precision without discarding legacy textual dates',()=>{
  expect(historyPeriod('2026-10-25')).toEqual({year:'2026',month:'10'})
  expect(historyPeriod('2026')).toEqual({year:'2026',month:'unknown'})
  expect(historyPeriod('约2016年')).toEqual({year:'unknown',month:'unknown'})
  expect(changeHistoryPrecision('约2016年','legacy')).toBe('约2016年')
  expect(changeHistoryPrecision('2026-10-25','month')).toBe('2026-10')
  expect(changeHistoryPrecision('2026-10','day')).toBe('')
  expect(historyDatePrecision('2026-13')).toBe('legacy')
})
