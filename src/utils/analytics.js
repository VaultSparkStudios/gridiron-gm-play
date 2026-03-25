// Privacy-safe anonymous event telemetry. No PII, no cookies.
// Set VITE_ANALYTICS_URL in .env.local to enable. No-op if unset.
const EP = import.meta.env.VITE_ANALYTICS_URL || '';
export const track = (event, extra = {}) => {
  if (!EP) return;
  try {
    const payload = JSON.stringify({ e: event, v: 'P10', t: Date.now(), ...extra });
    if (navigator.sendBeacon) navigator.sendBeacon(EP, payload);
    else fetch(EP, { method:'POST', body:payload, keepalive:true }).catch(()=>{});
  } catch {}
};
