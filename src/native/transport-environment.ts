import { Config } from "effect"

/** Explicit operator choices survive Gas City's clean check environment. */
export const nativeTransportEnvironment = Config.unwrap({
  GC_BEADS_PROXIED_NATIVE: Config.String("GC_BEADS_PROXIED_NATIVE").pipe(Config.withDefault("0")),
  GC_BEADS_PROXIED_IDLE_TIMEOUT: Config.String("GC_BEADS_PROXIED_IDLE_TIMEOUT").pipe(Config.withDefault("30m"))
})
