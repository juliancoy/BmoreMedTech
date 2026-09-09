# Events platform integration

The event-management tooling is provider-neutral. JSON plans describe the desired event changes, while adapters translate those operations to a provider API. Luma is the first provider.

## Safety

- Event plans are dry-run by default.
- API keys are read from the environment and must never be committed.
- Add `--execute` only after reviewing the printed operations.
- Luma may notify guests when event time, name, or location changes. Add `"suppress_notifications": true` to an event plan's `update` only when that is intentional.

## Luma setup

Generate a calendar-scoped API key in Luma under **Calendar Settings → Developer**, then export it only in the shell running the command:

```bash
export LUMA_API_KEY='...'
npm run events -- apply events/baltimore-medtech-formational-2026-09-29.json
npm run events -- apply events/baltimore-medtech-formational-2026-09-29.json --execute
```

The Luma adapter supports:

- event updates through `/v1/events/update`;
- collaborator/host addition through `/v1/events/hosts/add`;
- PNG or JPEG upload through `/v1/images/create-upload-url`, followed by applying the returned Luma CDN URL as the event cover.

Event plans use provider-neutral camelCase fields such as `startAt`, `endAt`, `tintColor`, and `descriptionMarkdown`. The Luma adapter maps them to Luma's API schema and rejects unknown fields so spelling errors cannot silently produce malformed writes.

To add another events platform, implement the same `updateEvent`, `addHost`, and `uploadImage` methods and register its factory in the CLI. Event plan files remain unchanged apart from their `provider` value.
