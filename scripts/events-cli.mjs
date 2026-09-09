#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { applyEventPlan, createEventsPlatform, registerEventsProvider } from './events-platform.mjs'
import { LumaEventsProvider } from './luma-events-provider.mjs'

registerEventsProvider('luma', (options) => new LumaEventsProvider(options))

function usage() {
  console.log('Usage: npm run events -- apply <plan.json> [--execute]')
  console.log('Dry-run is the default. Set LUMA_API_KEY and pass --execute to make changes.')
}

const [, , command, planPath, ...flags] = process.argv
if (command !== 'apply' || !planPath || flags.some((flag) => flag !== '--execute')) {
  usage()
  process.exitCode = 2
} else {
  const absolutePlanPath = resolve(planPath)
  const plan = JSON.parse(await readFile(absolutePlanPath, 'utf8'))
  const execute = flags.includes('--execute')
  const platform = execute ? createEventsPlatform(plan.provider) : {}
  const result = await applyEventPlan(platform, plan, {
    execute,
    baseDirectory: dirname(absolutePlanPath),
  })
  console.log(JSON.stringify(result, null, 2))
}
