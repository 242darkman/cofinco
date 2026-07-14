export * from "./comptes/types";
export * from "./comptes/helpers";
export * from "./comptes/creation";
export * from "./comptes/operations";
export * from "./comptes/status";
export * from "./comptes/status-suspension";
export * from "./comptes/queries";

import * as types from "./comptes/types";
import * as helpers from "./comptes/helpers";
import * as creation from "./comptes/creation";
import * as operations from "./comptes/operations";
import * as status from "./comptes/status";
import * as statusSuspension from "./comptes/status-suspension";
import * as queries from "./comptes/queries";

export default {
  ...types,
  ...helpers,
  ...creation,
  ...operations,
  ...status,
  ...statusSuspension,
  ...queries
};
