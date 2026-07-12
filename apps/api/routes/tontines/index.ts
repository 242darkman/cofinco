import type { Express } from "express";
import { registerTontineCoreRoutes } from "./tontines-core";
import { registerTontineMembresRoutes } from "./tontines-membres";
import { registerTontineContributionsRoutes } from "./tontines-contributions";
import { registerTontinePenalitesRoutes } from "./tontines-penalites";
import { registerTontinePlansRoutes } from "./tontines-plans";
import { registerTontineCyclesRoutes } from "./tontines-cycles";
import { registerTontineDistributionsRoutes } from "./tontines-distributions";
import { registerTontineDashboardRoutes } from "./tontines-dashboard";

export function registerTontineRoutes(app: Express) {
  registerTontineCoreRoutes(app);
  registerTontineMembresRoutes(app);
  registerTontineContributionsRoutes(app);
  registerTontinePenalitesRoutes(app);
  registerTontinePlansRoutes(app);
  registerTontineCyclesRoutes(app);
  registerTontineDistributionsRoutes(app);
  registerTontineDashboardRoutes(app);
}
