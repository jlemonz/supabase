import { createBrowserClient } from '@supabase/ssr'
import { type Session, type SupabaseClient, createClient } from '@supabase/supabase-js'
import { fetchWithRetry } from '../utils/fetch-retry'
import logger from '../utils/logger'
import type { Plugin } from '#app'
import { defineNuxtPlugin, useRuntimeConfig, useSupabaseSession, useSupabaseUser } from '#imports'

export default defineNuxtPlugin({
  name: 'supabase',
  enforce: 'pre',
  async setup({ provide }) {
    const { url, key, cookieOptions, cookiePrefix, useSsrCookies, clientOptions } = useRuntimeConfig().public.supabase

    let client

    if (useSsrCookies) {
      client = createBrowserClient(url, key, {
        ...clientOptions,
        cookieOptions: {
          ...cookieOptions,
          name: cookiePrefix,
        },
        isSingleton: true,
        global: {
          fetch: fetchWithRetry,
          ...clientOptions.global,
        },
      })
    }
    else {
      client = createClient(url, key, {
        ...clientOptions,
        global: {
          fetch: fetchWithRetry,
          ...clientOptions.global,
        },
      })
    }

    provide('supabase', { client })

    const currentSession = useSupabaseSession()
    const currentUser = useSupabaseUser()

    // Initialize user and session states with verification
    let session = null
    let user = null

    try {
      logger.info('Verifying user authentication')
      // Use getUser() as the primary authentication method
      const { data: userData, error: userError } = await client.auth.getUser()

      // Also check getSession() to compare with getUser() results
      const { data: sessionData, error: sessionError } = await client.auth.getSession()

      // Log comparison between getUser and getSession for debugging
      logger.info('Authentication verification', {
        hasUserData: !!userData?.user,
        hasSessionData: !!sessionData?.session,
        userError: userError?.message,
        sessionError: sessionError?.message,
        userMatch: userData?.user?.id === sessionData?.session?.user?.id,
      })

      if (!userError && userData.user) {
        user = userData.user
        logger.info('User authenticated successfully', { userId: user.id })

        // Also log any discrepancies between session and user data
        if (sessionData?.session) {
          const sessionUser = sessionData.session.user
          if (sessionUser?.id !== user.id) {
            logger.warn('User ID mismatch between getUser and getSession', {
              getUserId: user.id,
              getSessionUserId: sessionUser.id,
            })
          }
        }

        // Construct a session object directly from JWT if available
        // This completely bypasses the need for getSession()
        // Correct implementation without the 'user' property in the session object
        if (user) {
          // If we have session data from getSession(), use it
          if (sessionData?.session) {
            // Use actual session data while removing the user property which is handled separately
            const { user: _, ...sessionWithoutUser } = sessionData.session
            session = sessionWithoutUser
            logger.info('Using session data from getSession()')
          }
          // Fallback to constructed session object
          else {
            session = {
              // These properties match the Session interface without the 'user' property
              access_token: '', // Access token is managed internally by the client
              refresh_token: '', // Refresh token is managed internally by the client
              expires_in: 3600, // Default expiry time, not critical as client manages refreshing
              expires_at: Math.floor(Date.now() / 1000) + 3600, // Approx expiry timestamp
              token_type: 'bearer',
            }
            logger.info('Session constructed from user data successfully')
          }
        }
      }
      else {
        logger.info('No active user found')
        if (userError) {
          logger.error('User verification error:', userError)
        }
      }
    }
    catch (error) {
      logger.error('Authentication initialization error:', error)
      session = null
      user = null
    }

    // Set the reactive state variables
    currentSession.value = session
    currentUser.value = user

    // Updates the session and user states through auth events
    client.auth.onAuthStateChange((event, session: Session | null) => {
      logger.info('Auth state changed', { event, session })
      if (JSON.stringify(currentSession.value) !== JSON.stringify(session)) {
        currentSession.value = session
        currentUser.value = session?.user ?? null
      }
    })
  },
}) as Plugin<{ client: SupabaseClient }>
