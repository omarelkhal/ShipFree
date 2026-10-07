import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth/auth'
import { isProd } from '@/lib/constants'
import { generateMetadata } from '@/lib/seo'
import { VerifyContent } from './verify-content'

export const dynamic = 'force-dynamic'

export const metadata = generateMetadata({
  title: 'Verification | ShipFree',
})

export default async function VerifyPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session?.user.emailVerified) {
    redirect('/dashboard')
  }

  return (
    <VerifyContent isProduction={isProd} initialEmail={session?.user.email ?? null} />
  )
}
