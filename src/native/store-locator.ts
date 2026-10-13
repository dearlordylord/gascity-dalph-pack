import { Schema } from "effect"

/** An explicit local CITY/RIG identity; it never authorizes a cross-store search. */
export const NativeLocalStoreLocator = Schema.String.check(
  Schema.isPattern(/^(city|rig):[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/)
).pipe(Schema.brand("NativeLocalStoreLocator"))
