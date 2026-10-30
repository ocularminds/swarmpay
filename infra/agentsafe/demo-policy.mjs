// A synthetic fixture policy, never a hosted Decionis policy.
export function commerceDemoPolicy(request) {
  const { method, path, body } = request.action.parameters;
  if (method !== 'POST' || path !== '/internal/payments/commands' || !body || typeof body !== 'object') return 'BLOCK';
  if (!['tents', 'catering'].includes(body.merchantId) || body.currency !== 'USD') return 'BLOCK';
  if (!Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0 || body.amountMinor > 150000) return 'BLOCK';
  if (!['CREATE_ORDER', 'CAPTURE_ORDER', 'AUTHORIZE_ORDER', 'CAPTURE_AUTHORIZATION', 'VOID_AUTHORIZATION', 'REAUTHORIZE_AUTHORIZATION', 'REFUND_CAPTURE'].includes(body.operation)) return 'BLOCK';
  if (body.operation === 'CAPTURE_AUTHORIZATION' && !/^[a-f0-9]{64}$/.test(body.evidenceDigest ?? '')) return 'ESCALATE';
  if (!body.reservationId || body.reservationId !== body.workflowId || body.planVersion !== 1 || body.policyVersion !== 'swarm-pay-demo-v1') return 'BLOCK';
  // The private Java executor independently checks persisted consent, the total
  // reservation, exact prices, provider resource ownership and the signed receipt.
  return 'ALLOW';
}
