import { describe, expect, it, vi } from 'vitest'
import { ConsoleEmailSender } from '../examples/shared/email.js'

describe('example email sender', () => {
  it('redacts delivered email text in console output by default', async () => {
    const originalFlag = process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT
    delete process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const sender = new ConsoleEmailSender('test')
      await sender.sendEmail({
        to: 'demo@example.com',
        subject: 'Sign in',
        text: 'Your sign-in code is 123456.',
      })

      expect(sender.listMessages()[0]?.text).toBe('Your sign-in code is 123456.')
      expect(consoleLog).toHaveBeenCalledTimes(1)
      expect(consoleLog.mock.calls[0]?.[0]).not.toContain('123456')
      expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toMatchObject({
        text: '[redacted]',
        textRedacted: true,
      })
    } finally {
      consoleLog.mockRestore()
      if (originalFlag === undefined) {
        delete process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT
      } else {
        process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT = originalFlag
      }
    }
  })

  it('allows explicit local debugging of delivered email text', async () => {
    const originalFlag = process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT
    process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT = 'true'
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const sender = new ConsoleEmailSender('test')
      await sender.sendEmail({
        to: 'demo@example.com',
        subject: 'Sign in',
        text: 'Your sign-in code is 123456.',
      })

      expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toMatchObject({
        text: 'Your sign-in code is 123456.',
        textRedacted: false,
      })
    } finally {
      consoleLog.mockRestore()
      if (originalFlag === undefined) {
        delete process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT
      } else {
        process.env.UNIAUTH_EXAMPLE_LOG_EMAIL_TEXT = originalFlag
      }
    }
  })
})
