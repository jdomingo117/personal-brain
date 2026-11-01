/** Fixed-schema, content-free request samples for aggregate Budget monitoring.
 * The sink may fail without changing a response or converting a commit to an apparent failure.
 * Never accept the request, response body, actor/tenant IDs or an arbitrary error as a log field.
 */
type Endpoint = 'query-budget' | 'manage-budget'
type Sample = { event: 'budget.request.v1'; endpoint: Endpoint; status: number; outcome: string; duration_ms: number }
export function withBudgetTelemetry(
 endpoint: Endpoint,
 handler: (request: Request) => Promise<Response>,
 emit: (sample: Sample) => void = sample => console.log(JSON.stringify(sample)),
 clock: () => number = () => performance.now(),
): (request: Request) => Promise<Response> {
 return async request => {
  const started = clock()
  let status = 500
  try {
   const response = await handler(request)
   status = response.status
   return response
  } finally {
   // CORS preflight is not an application request or a financial outcome.
   if (request.method !== 'OPTIONS') {
    const elapsed = clock() - started
    const outcome = status >= 500 ? 'unavailable' : status === 409 ? 'conflict' : status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'denied' : status >= 400 ? 'rejected' : 'success'
    try { emit({ event: 'budget.request.v1', endpoint, status, outcome, duration_ms: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0 }) } catch { /* telemetry must never affect a commit or read */ }
   }
  }
 }
}
