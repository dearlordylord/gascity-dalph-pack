import { Config, Schema } from "effect"
import { AbsolutePath, Branch } from "../domain/attempt.ts"

const CityName = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("CityName"))
const Rig = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]+$/)).pipe(Schema.brand("Rig"))
const Endpoint = Schema.String.check(Schema.isPattern(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/)).pipe(
  Schema.brand("TrackerEndpoint")
)
export const RuntimeConfig = Schema.Struct({
  root: AbsolutePath,
  pack: AbsolutePath,
  city: AbsolutePath,
  repo: AbsolutePath,
  worktrees: AbsolutePath,
  cityName: CityName,
  rig: Rig,
  endpoint: Endpoint,
  branch: Branch,
  contract: Schema.optionalKey(AbsolutePath),
  faultAfterPush: Schema.optionalKey(Schema.String)
})
export type RuntimeConfig = typeof RuntimeConfig.Type
export const configuration = Config.unwrap({
  root: Config.schema(AbsolutePath, "DALPH_TRIAL_ROOT"),
  pack: Config.schema(AbsolutePath, "DALPH_PACK_ROOT"),
  city: Config.schema(AbsolutePath, "DALPH_CITY_ROOT"),
  repo: Config.schema(AbsolutePath, "DALPH_TARGET_REPO"),
  worktrees: Config.schema(AbsolutePath, "DALPH_WORKTREE_ROOT"),
  cityName: Config.schema(CityName, "DALPH_CITY_NAME"),
  rig: Config.schema(Rig, "DALPH_RIG"),
  endpoint: Config.schema(Endpoint, "DALPH_TRACKER_ENDPOINT"),
  branch: Config.schema(Branch, "DALPH_TARGET_BRANCH")
})
