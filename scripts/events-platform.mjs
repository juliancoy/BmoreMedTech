import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROVIDERS = new Map()

export function registerEventsProvider(name, factory) {
  if (!name || typeof factory !== 'function') throw new TypeError('A provider name and factory are required')
  PROVIDERS.set(name, factory)
}

export function createEventsPlatform(name, options = {}) {
  const factory = PROVIDERS.get(name)
  if (!factory) throw new Error(`Unsupported events provider: ${name}`)
  return factory(options)
}

export function registeredEventsProviders() {
  return [...PROVIDERS.keys()].sort()
}

export function validateEventPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new TypeError('Event plan must be an object')
  if (plan.schemaVersion !== 1) throw new Error('Event plan schemaVersion must be 1')
  if (typeof plan.provider !== 'string' || !plan.provider) throw new Error('Event plan provider is required')
  if (typeof plan.eventId !== 'string' || !plan.eventId) throw new Error('Event plan eventId is required')
  if (plan.update != null && (typeof plan.update !== 'object' || Array.isArray(plan.update))) {
    throw new Error('Event plan update must be an object')
  }
  if (plan.coverFile != null && typeof plan.coverFile !== 'string') throw new Error('coverFile must be a path')
  if (plan.hosts != null && !Array.isArray(plan.hosts)) throw new Error('hosts must be an array')
  for (const host of plan.hosts || []) {
    if (!host || typeof host.email !== 'string' || !host.email.includes('@')) {
      throw new Error('Every host requires an email address')
    }
  }
  return plan
}

export async function applyEventPlan(platform, plan, { execute = false, baseDirectory = process.cwd() } = {}) {
  validateEventPlan(plan)
  const operations = []
  let coverUrl

  if (plan.coverFile) {
    operations.push({ action: 'uploadCover', file: plan.coverFile })
    if (execute) coverUrl = await platform.uploadImage(pathToFileURL(resolve(baseDirectory, plan.coverFile)))
  }

  const update = { ...(plan.update || {}) }
  if (coverUrl) update.coverUrl = coverUrl
  if (Object.keys(update).length || plan.coverFile) {
    operations.push({ action: 'updateEvent', eventId: plan.eventId, update: coverUrl ? update : { ...update, coverFile: plan.coverFile } })
    if (execute) await platform.updateEvent(plan.eventId, update)
  }

  for (const host of plan.hosts || []) {
    operations.push({ action: 'addHost', eventId: plan.eventId, host })
    if (execute) await platform.addHost(plan.eventId, host)
  }

  return { executed: execute, provider: plan.provider, eventId: plan.eventId, operations }
}
