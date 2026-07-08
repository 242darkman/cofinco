import type { NextFunction, Request, Response } from "express";
import type { TenantFeatureKey } from "@shared/tenant-config";
import { getTenantConfig } from "../config/tenant-config";

interface FeatureRouteRule {
  feature: TenantFeatureKey;
  paths: RegExp[];
}

const FEATURE_ROUTE_RULES: FeatureRouteRule[] = [
  {
    feature: "enableTontine",
    paths: [
      /^\/api\/tontines(?:\/|$)/,
      /^\/api\/tontine-(?:plans|penalites|schedule)(?:\/|$)/,
      /^\/api\/contributions-tontine(?:\/|$)/,
      /^\/api\/clients\/[^/]+\/tontines(?:\/|$)/,
    ],
  },
  {
    feature: "enableMobileMoney",
    paths: [
      /^\/api\/mobile-money(?:\/|$)/,
      /^\/api\/payments(?:\/|$)/,
      /^\/api\/webhooks\/pawapay(?:\/|$)/,
    ],
  },
  {
    feature: "enableFieldAgents",
    paths: [
      /^\/api\/(?:agents-terrain|agents|agent-[^/]+|tracking|prospections|visites-terrain|paiements-terrain|zones|objectifs-mensuels|agent-geolocations)(?:\/|$)/,
    ],
  },
  {
    feature: "enableSms",
    paths: [/^\/api\/sms(?:\/|$)/],
  },
];

export function getRequiredTenantFeature(path: string): TenantFeatureKey | undefined {
  return FEATURE_ROUTE_RULES.find(rule => rule.paths.some(pattern => pattern.test(path)))?.feature;
}

export function enforceTenantFeatures(req: Request, res: Response, next: NextFunction): void {
  const feature = getRequiredTenantFeature(req.path);
  if (!feature || getTenantConfig().features[feature]) {
    next();
    return;
  }

  res.status(404).json({
    code: "FEATURE_DISABLED",
    message: "Cette fonctionnalité n'est pas disponible pour ce déploiement.",
  });
}
