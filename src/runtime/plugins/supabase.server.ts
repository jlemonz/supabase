import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import { getHeader, setCookie } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchWithRetry } from '../utils/fetch-retry'
import logger from '../utils/logger'
import { serverSupabaseUser, serverSupabaseSession } from '../server/services'
import { defineNuxtPlugin, useRequestEvent, useRuntimeConfig, useSupabaseSession, useSupabaseUser } from '#imports'
import type { CookieOptions, Plugin } from '#app'

export default defineNuxtPlugin({
  name: 'supabase',
  enforce: 'pre',
  async setup({ provide }) {
    logger.info('Initializing server-side Supabase client')
    const { url, key, cookiePrefix, useSsrCookies, cookieOptions, clientOptions } = useRuntimeConfig().public.supabase

    const event = useRequestEvent()!

    const client = createServerClient(url, key, {
      ...clientOptions,
      cookies: {
        getAll: () => parseCookieHeader(getHeader(event, 'Cookie') ?? ''),
        setAll: (
          cookies: {
            name: string
            value: string
            options: CookieOptions
          }[],
        ) => cookies.forEach(({ name, value, options }) => setCookie(event, name, value, options)),
      },
      cookieOptions: {
        ...cookieOptions,
        name: cookiePrefix,
      },
      global: {
        fetch: fetchWithRetry,
        ...clientOptions.global,
      },
    })

    provide('supabase', { client })

    // Initialize user and session states if available.
    if (useSsrCookies) {
      logger.info('Attempting to retrieve server-side Supabase session and user')
      try {
        const [
          session,
          user,
        ] = await Promise.all([
          serverSupabaseSession(event).catch((error) => {
            logger.error('Failed to retrieve server-side Supabase session', error)
            return null
          }),
          serverSupabaseUser(event).catch((error) => {
            logger.error('Failed to retrieve server-side Supabase user', error)
            return null
          }),
        ])

        useSupabaseSession().value = session
        useSupabaseUser().value = user

        if (session && user) {
          logger.info('Successfully retrieved server-side Supabase session and user', {
            userId: user.id,
            hasSession: !!session,
          })
        }
        else {
          logger.info('No active server-side Supabase session or user found', {
            hasSession: !!session,
            hasUser: !!user,
          })
        }
      }
      catch (error) {
        logger.error('Error initializing server-side Supabase authentication', error)
      }
    }
    else {
      logger.info('SSR cookies disabled, skipping server-side auth initialization')
    }
  },
}) as Plugin<{ client: SupabaseClient }>
