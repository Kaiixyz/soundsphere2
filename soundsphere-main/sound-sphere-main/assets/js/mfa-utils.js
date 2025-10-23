// Lightweight shared utilities used by auth pages (no DOM assumptions)
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function getPenaltyTime(totalFailedAttempts) {
  if (totalFailedAttempts >= 9) return 120;
  if (totalFailedAttempts >= 6) return 60;
  if (totalFailedAttempts >= 3) return 30;
  return 0;
}

module.exports = { isValidEmail, getPenaltyTime };

// Also expose for browser global usage
if (typeof window !== 'undefined') {
  window.MFA_UTILS = { isValidEmail, getPenaltyTime };
}
