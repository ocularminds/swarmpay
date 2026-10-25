import test from 'node:test';
import assert from 'node:assert/strict';
import { commerceDemoPolicy } from './demo-policy.mjs';
const command = { merchantId: 'catering', amountMinor: 90000, currency: 'USD', operation: 'AUTHORIZE_ORDER', workflowId: 'event', reservationId: 'event', planVersion: 1, policyVersion: 'swarm-pay-demo-v1' };
const decide = body => commerceDemoPolicy({ action: { parameters: { method: 'POST', path: '/internal/payments/commands', body } } });
test('local policy rejects recipient and amount substitution', () => {
  assert.equal(decide(command), 'ALLOW');
  assert.equal(decide({ ...command, merchantId: 'attacker' }), 'BLOCK');
  assert.equal(decide({ ...command, amountMinor: 160000 }), 'BLOCK');
  assert.equal(decide({ ...command, currency: 'EUR' }), 'BLOCK');
});
test('milestone needs an evidence binding', () => {
  assert.equal(decide({ ...command, operation: 'CAPTURE_AUTHORIZATION' }), 'ESCALATE');
  assert.equal(decide({ ...command, operation: 'CAPTURE_AUTHORIZATION', evidenceDigest: 'a'.repeat(64) }), 'ALLOW');
});
