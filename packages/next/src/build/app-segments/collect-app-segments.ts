import type { LoadComponentsReturnType } from '../../server/load-components'
import type { Params } from '../../server/request/params'
import type {
  AppPageRouteModule,
  AppPageModule,
} from '../../server/route-modules/app-page/module.compiled'
import type {
  AppRouteRouteModule,
  AppRouteModule,
} from '../../server/route-modules/app-route/module.compiled'
import {
  type AppSegmentConfig,
  AppSegmentConfigSchema,
} from './app-segment-config'

import { InvariantError } from '../../shared/lib/invariant-error'
import {
  isAppRouteRouteModule,
  isAppPageRouteModule,
} from '../../server/route-modules/checks'
import { isClientReference } from '../../lib/client-reference'
import { getSegmentParam } from '../../server/app-render/get-segment-param'
import { getLayoutOrPageModule } from '../../server/lib/app-dir-module'
import { normalizeZodErrors } from '../../shared/lib/zod'

type GenerateStaticParams = (options: { params?: Params }) => Promise<Params[]>

/**
 * Parses the app config and attaches it to the segment.
 */
function attach(segment: AppSegment, userland: unknown) {
  // If the userland is not an object, then we can't do anything with it.
  if (typeof userland !== 'object' || userland === null) {
    return
  }

  // Try to parse the application configuration.
  const config = AppSegmentConfigSchema.safeParse(userland)
  if (!config.success) {
    const messages = [
      `Invalid segment configuration options detected for "${segment.filePath}": `,
    ]
    for (const { message } of normalizeZodErrors(config.error)) {
      messages.push(`    ${message}`)
    }
    throw new Error(messages.join('\n'))
  }

  // If there was any keys on the config, then attach it to the segment.
  if (Object.keys(config.data).length > 0) {
    segment.config = config.data
  }

  if (
    'generateStaticParams' in userland &&
    typeof userland.generateStaticParams === 'function'
  ) {
    segment.generateStaticParams =
      userland.generateStaticParams as GenerateStaticParams

    // Validate that `generateStaticParams` makes sense in this context.
    if (segment.config?.runtime === 'edge') {
      throw new Error(
        'Edge runtime is not supported with `generateStaticParams`.'
      )
    }
  }
}

export type AppSegment = {
  name: string
  param: string | undefined
  filePath: string | undefined
  config: AppSegmentConfig | undefined
  isDynamicSegment: boolean
  generateStaticParams: GenerateStaticParams | undefined
}

/**
 * Walks the loader tree and collects the generate parameters for each segment.
 *
 * @param routeModule the app page route module
 * @returns the segments for the app page route module
 */
async function collectAppPageSegments(routeModule: AppPageRouteModule) {
  const segments: AppSegment[] = []

  let current = routeModule.userland.loaderTree
  while (current) {
    const [name, parallelRoutes] = current
    const { mod: userland, filePath } = await getLayoutOrPageModule(current)

    const isClientComponent: boolean = userland && isClientReference(userland)
    const isDynamicSegment = /^\[.*\]$/.test(name)
    const param = isDynamicSegment ? getSegmentParam(name)?.param : undefined

    const segment: AppSegment = {
      name,
      param,
      filePath,
      config: undefined,
      isDynamicSegment,
      generateStaticParams: undefined,
    }

    // Only server components can have app segment configurations. If this isn't
    // an object, then we should skip it. This can happen when parsing the
    // error components.
    if (!isClientComponent) {
      attach(segment, userland)
    }

    segments.push(segment)

    // Use this route's parallel route children as the next segment.
    current = parallelRoutes.children
  }

  return segments
}

/**
 * Collects the segments for a given app route module.
 *
 * @param routeModule the app route module
 * @returns the segments for the app route module
 */
function collectAppRouteSegments(
  routeModule: AppRouteRouteModule
): AppSegment[] {
  // Get the pathname parts, slice off the first element (which is empty).
  const parts = routeModule.definition.pathname.split('/').slice(1)
  if (parts.length === 0) {
    throw new InvariantError('Expected at least one segment')
  }

  // Generate all the segments.
  const segments: AppSegment[] = parts.map((name) => {
    const isDynamicSegment = /^\[.*\]$/.test(name)
    const param = isDynamicSegment ? getSegmentParam(name)?.param : undefined

    return {
      name,
      param,
      filePath: undefined,
      isDynamicSegment,
      config: undefined,
      generateStaticParams: undefined,
    }
  })

  // We know we have at least one, we verified this above. We should get the
  // last segment which represents the root route module.
  const segment = segments[segments.length - 1]

  segment.filePath = routeModule.definition.filename

  // Extract the segment config from the userland module.
  attach(segment, routeModule.userland)

  return segments
}

/**
 * Collects the segments for a given route module.
 *
 * @param components the loaded components
 * @returns the segments for the route module
 */
export function collectSegments({
  routeModule,
}: LoadComponentsReturnType<AppPageModule | AppRouteModule>):
  | Promise<AppSegment[]>
  | AppSegment[] {
  if (isAppRouteRouteModule(routeModule)) {
    return collectAppRouteSegments(routeModule)
  }

  if (isAppPageRouteModule(routeModule)) {
    return collectAppPageSegments(routeModule)
  }

  throw new InvariantError(
    'Expected a route module to be one of app route or page'
  )
}
