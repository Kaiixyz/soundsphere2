const assert = require('assert');
const { isValidEmail, getPenaltyTime } = require('../assets/js/mfa-utils');

assert.strictEqual(isValidEmail('user@example.com'), true, 'valid email should pass');
assert.strictEqual(isValidEmail('invalid-email'), false, 'invalid email should fail');

assert.strictEqual(getPenaltyTime(0), 0);
assert.strictEqual(getPenaltyTime(3), 30);
assert.strictEqual(getPenaltyTime(6), 60);
assert.strictEqual(getPenaltyTime(9), 120);

console.log('mfa-utils tests passed');
