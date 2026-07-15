import { initiateHandover, startCounting } from "./handover-initiation";
import { confirmHandover, approveDisputed, cancelHandover } from "./handover-resolution";

export const handoverWorkflow = {
  initiateHandover,
  startCounting,
  confirmHandover,
  approveDisputed,
  cancelHandover
};
