import { describe, expect, it, vi } from 'vitest'
import { focusFirstInvalidField, validationErrorText } from '../app/utils/login-form'

describe('validation error text', () => {
  it('reads the first usable message from strings, Standard Schema issues and mixed arrays', () => {
    expect(validationErrorText(['用户名不能为空'])).toBe('用户名不能为空')
    expect(validationErrorText([{ message: '密码不能为空', path: ['password'] }])).toBe('密码不能为空')
    expect(validationErrorText([undefined, { message: '二步密码至少 4 位' }])).toBe('二步密码至少 4 位')
    expect(validationErrorText([{ message: '' }, 'fallback message'])).toBe('fallback message')
  })

  it('returns an empty string for absent or unusable errors', () => {
    expect(validationErrorText(undefined)).toBe('')
    expect(validationErrorText([])).toBe('')
    expect(validationErrorText([123, null, {}])).toBe('')
  })
})

describe('first invalid field focus', () => {
  function fakeElement() {
    return { focus: vi.fn() } as unknown as HTMLElement
  }

  it('focuses only the control marked aria-invalid', () => {
    const invalid = fakeElement()
    const querySelector = vi.fn((selector: string) => (selector === '[aria-invalid="true"]' ? invalid : null))
    focusFirstInvalidField({ querySelector } as unknown as ParentNode)
    expect(querySelector).toHaveBeenCalledWith('[aria-invalid="true"]')
    expect(invalid.focus).toHaveBeenCalledTimes(1)

    const inputOnly = fakeElement()
    focusFirstInvalidField({
      querySelector: vi.fn((selector: string) => (selector === 'input' ? inputOnly : null)),
    } as unknown as ParentNode)
    expect(inputOnly.focus).not.toHaveBeenCalled()
  })

  it('never throws when the form is not mounted', () => {
    expect(() => focusFirstInvalidField(null)).not.toThrow()
    expect(() => focusFirstInvalidField(undefined)).not.toThrow()
  })
})
