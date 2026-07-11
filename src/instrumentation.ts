export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Some environments (observed on WSL2) advertise an IPv6 route that is
    // actually unreachable. Node's Happy Eyeballs (autoSelectFamily) races
    // IPv4/IPv6 connection attempts in parallel, and on these systems the
    // dead IPv6 attempts cause the whole race to fail/timeout instead of
    // falling back to the working IPv4 address — breaking fetch() calls to
    // Neon/Upstash/etc. Disabling it makes connections sequential (IPv4
    // first) and is safe everywhere, not just on affected systems.
    const net = await import("net");
    net.setDefaultAutoSelectFamily(false);
  }
}
