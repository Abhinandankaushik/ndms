const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function toE164(input: string): string | null {
  const candidate = withCountryCode(input.replace(/[\s().-]/g, ''));
  return candidate !== null && E164_PATTERN.test(candidate) ? candidate : null;
}

export function formatPhoneForDisplay(phone: string): string {
  const indian = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : phone;
}

// Indian mobiles are usually typed as 10 digits, sometimes with a trunk 0 or the 91 country code;
// anything starting with + is taken as a full international number.
function withCountryCode(compact: string): string | null {
  if (compact.startsWith('+')) return compact;
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^0\d{10}$/.test(compact)) return `+91${compact.slice(1)}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return null;
}
