// Credentials with more than one part. Most providers need one API key; a few need more (Blaxel: workspace + key,
// Vercel: token + project + optional team, boat: key + optional organization). Fleet keeps each credential as ONE string,
// the parts joined with ":" in the order of `facts.fields`, so the saved key and the X-<Provider>-Key header look the same
// and the adapter splits it again. The cabinet shows one input per part.
export const SINGLE = [{ id: 'key', label: 'API key', secret: true }];
export const fieldsOf = (provider) => provider?.facts?.fields || SINGLE;

// values: { [field id]: string }. Required parts must be present; optional parts may be empty (trailing ones are dropped).
export function joinFields(provider, values) {
  const fields = fieldsOf(provider);
  const parts = fields.map((f) => String(values[f.id] ?? '').trim());
  for (const [i, f] of fields.entries()) {
    if (!f.optional && !parts[i]) return { error: `${f.label} is required.` };
    if (parts[i].includes(':') && fields.length > 1) return { error: `${f.label} must not contain a colon.` };
  }
  while (parts.length > 1 && !parts[parts.length - 1] && fields[parts.length - 1].optional) parts.pop();
  return { value: parts.join(':') };
}

// The reverse, for pages that show what is connected: never used on secrets.
export const splitFields = (provider, value) => {
  const fields = fieldsOf(provider);
  const parts = String(value).split(':');
  return Object.fromEntries(fields.map((f, i) => [f.id, parts[i] ?? '']));
};
