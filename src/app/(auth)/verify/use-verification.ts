'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { client, useSession } from '@/lib/auth/auth-client'

interface UseVerificationParams {
  isProduction: boolean
  initialEmail?: string | null
}

interface UseVerificationReturn {
  otp: string
  email: string
  isLoading: boolean
  isVerified: boolean
  isInvalidOtp: boolean
  errorMessage: string
  isOtpComplete: boolean
  isProduction: boolean
  isContextReady: boolean
  verifyCode: () => Promise<void>
  resendCode: () => void
  handleOtpChange: (value: string) => void
}

const getOtpType = (fromSignup: boolean) => (fromSignup ? 'email-verification' : 'sign-in')

export function useVerification({
  isProduction,
  initialEmail = null,
}: UseVerificationParams): UseVerificationReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, isPending: isSessionPending, refetch: refetchSession } = useSession()
  const [otp, setOtp] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isSendingInitialOtp, setIsSendingInitialOtp] = useState(false)
  const [isInvalidOtp, setIsInvalidOtp] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)
  const [isContextReady, setIsContextReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const storedRedirectUrl = sessionStorage.getItem('inviteRedirectUrl')
    if (storedRedirectUrl) {
      setRedirectUrl(storedRedirectUrl)
    }

    const redirectParam = searchParams.get('redirectAfter')
    if (redirectParam) {
      setRedirectUrl(redirectParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (isSessionPending) {
      return
    }

    if (session?.user.emailVerified) {
      window.location.href = '/dashboard'
      return
    }

    const storedEmail = sessionStorage.getItem('verificationEmail')?.trim().toLowerCase() ?? ''
    const sessionEmail = session?.user.email?.trim().toLowerCase() ?? ''
    const serverEmail = initialEmail?.trim().toLowerCase() ?? ''
    const resolvedEmail = storedEmail || sessionEmail || serverEmail

    if (!resolvedEmail) {
      router.replace('/register')
      return
    }

    setEmail(resolvedEmail)

    if (!storedEmail) {
      sessionStorage.setItem('verificationEmail', resolvedEmail)
    }

    setIsContextReady(true)
  }, [initialEmail, isSessionPending, router, session])

  useEffect(() => {
    const fromSignup = searchParams.get('fromSignup') === 'true'

    if (!isContextReady || !email || isSendingInitialOtp) {
      return
    }

    setIsSendingInitialOtp(true)
    setIsLoading(true)
    setErrorMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    client.emailOtp
      .sendVerificationOtp({
        email: normalizedEmail,
        type: getOtpType(fromSignup),
      })
      .catch(() => {
        setErrorMessage('Failed to send verification code. Check email settings and try Resend.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [email, isContextReady, isSendingInitialOtp, searchParams])

  const isOtpComplete = otp.length === 6

  async function verifyCode() {
    if (!isOtpComplete || !email) return

    setIsLoading(true)
    setIsInvalidOtp(false)
    setErrorMessage('')

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const fromSignup = searchParams.get('fromSignup') === 'true'

      const response = fromSignup
        ? await client.emailOtp.verifyEmail({
            email: normalizedEmail,
            otp,
          })
        : await client.signIn.emailOtp({
            email: normalizedEmail,
            otp,
          })

      if (response && !response.error) {
        setIsVerified(true)

        try {
          await refetchSession()
        } catch (e) {
          console.warn('Failed to refetch session after verification', e)
        }

        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('verificationEmail')
        }

        setTimeout(() => {
          if (redirectUrl) {
            window.location.href = redirectUrl
          } else {
            window.location.href = '/dashboard'
          }
        }, 1000)
      } else {
        const message = 'Invalid verification code. Please check and try again.'
        setIsInvalidOtp(true)
        setErrorMessage(message)
        setOtp('')
      }
    } catch (error: unknown) {
      let message = 'Verification failed. Please check your code and try again.'
      const errorMessageText =
        error instanceof Error ? error.message : typeof error === 'string' ? error : ''

      if (errorMessageText.includes('expired')) {
        message = 'The verification code has expired. Please request a new one.'
      } else if (errorMessageText.includes('invalid')) {
        message = 'Invalid verification code. Please check and try again.'
      } else if (errorMessageText.includes('attempts')) {
        message = 'Too many failed attempts. Please request a new code.'
      }

      setIsInvalidOtp(true)
      setErrorMessage(message)
      setOtp('')
    } finally {
      setIsLoading(false)
    }
  }

  function resendCode() {
    if (!email) return

    setIsLoading(true)
    setErrorMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    const fromSignup = searchParams.get('fromSignup') === 'true'

    client.emailOtp
      .sendVerificationOtp({
        email: normalizedEmail,
        type: getOtpType(fromSignup),
      })
      .catch(() => {
        setErrorMessage('Failed to resend verification code. Please try again later.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  function handleOtpChange(value: string) {
    if (value.length === 6) {
      setIsInvalidOtp(false)
      setErrorMessage('')
    }
    setOtp(value)
  }

  useEffect(() => {
    if (otp.length === 6 && email && !isLoading && !isVerified && isContextReady) {
      const timeoutId = setTimeout(() => {
        void verifyCode()
      }, 300)

      return () => clearTimeout(timeoutId)
    }
  }, [otp, email, isLoading, isVerified, isContextReady])

  return {
    otp,
    email,
    isLoading,
    isVerified,
    isInvalidOtp,
    errorMessage,
    isOtpComplete,
    isProduction,
    isContextReady,
    verifyCode,
    resendCode,
    handleOtpChange,
  }
}
