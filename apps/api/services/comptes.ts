export * from "./comptes/types";
export * from "./comptes/helpers";
export * from "./comptes/creation";
export * from "./comptes/creation-avec-depot";
export * from "./comptes/creation-depot-paiement";
export * from "./comptes/operations";
export * from "./comptes/operations-interets-transfert";
export * from "./comptes/status";
export * from "./comptes/status-suspension";
export * from "./comptes/queries";

import * as types from "./comptes/types";
import * as helpers from "./comptes/helpers";
import * as creation from "./comptes/creation";
import * as creationAvecDepot from "./comptes/creation-avec-depot";
import * as creationDepotPaiement from "./comptes/creation-depot-paiement";
import * as operations from "./comptes/operations";
import * as operationsInteretsTransfert from "./comptes/operations-interets-transfert";
import * as status from "./comptes/status";
import * as statusSuspension from "./comptes/status-suspension";
import * as queries from "./comptes/queries";

export default {
  ...types,
  ...helpers,
  ...creation,
  ...creationAvecDepot,
  ...creationDepotPaiement,
  ...operations,
  ...operationsInteretsTransfert,
  ...status,
  ...statusSuspension,
  ...queries
};
