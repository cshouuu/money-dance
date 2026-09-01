import { describe, expect, it } from 'vitest'
import { compareVersions, formatAndroidUpdateError, isTrustedPgyerReleasePage } from './appUpdate'

describe('Android updater', () => {
  it('compares semantic versions without relying on string ordering', () => {
    expect(compareVersions('0.2.28', '0.2.27')).toBe(1)
    expect(compareVersions('v0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(0)
  })

  it('only trusts a clean public Pgyer short-link page', () => {
    expect(isTrustedPgyerReleasePage('https://www.pgyer.com/MoneyDance')).toBe(true)
    expect(isTrustedPgyerReleasePage('http://www.pgyer.com/MoneyDance')).toBe(false)
    expect(isTrustedPgyerReleasePage('https://www.pgyer.com.evil.test/MoneyDance')).toBe(false)
    expect(isTrustedPgyerReleasePage('https://www.pgyer.com/MoneyDance?token=secret')).toBe(false)
    expect(isTrustedPgyerReleasePage('https://user@www.pgyer.com/MoneyDance')).toBe(false)
  })

  it('does not expose native exception details to users', () => {
    const timeout = new Error('UPDATE_CHECK_FAILED: SocketTimeoutException: failed to connect to 1.2.3.4')
    expect(formatAndroidUpdateError(timeout)).toContain('当前网络无法连接蒲公英更新服务')
    expect(formatAndroidUpdateError(timeout)).not.toContain('1.2.3.4')

    expect(formatAndroidUpdateError(new Error('PGYER_PAGE_FORMAT_CHANGED'))).toContain('直接打开蒲公英下载页')
  })
})
