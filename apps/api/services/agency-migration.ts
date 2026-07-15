export * from "./agency-migration/types";
export * from "./agency-migration/helpers";
export * from "./agency-migration/checks";
export * from "./agency-migration/dry-run";
export * from "./agency-migration/execution";
export * from "./agency-migration/rollback";
export * from "./agency-migration/lifecycle";
export * from "./agency-migration/queries";

import * as lifecycle from "./agency-migration/lifecycle";
import * as execution from "./agency-migration/execution";
import * as rollback from "./agency-migration/rollback";
import * as dryRun from "./agency-migration/dry-run";
import * as queries from "./agency-migration/queries";
import * as checks from "./agency-migration/checks";

export const agencyMigrationService = {
  ...lifecycle,
  ...execution,
  ...rollback,
  ...dryRun,
  ...queries,
  ...checks
};
