import type { NextFunction, Request, Response } from "express";
import type { TenantFeatureKey } from "@shared/tenant-config";
import { getTenantConfig } from "../config/tenant-config";
import { getEffectiveFeatures } from "../services/tenant-feature-service";

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
      /^\/api\/payments(?:-test)?(?:\/|$)/,
      /^\/api\/webhooks\/pawapay(?:\/|$)/,
      /^\/api\/monitoring\/pawapay-[^/]+(?:\/|$)/,
    ],
  },
  {
    feature: "enableFieldAgents",
    paths: [
      /^\/api\/(?:agents-terrain|agents|agent-[^/]+|tracking|prospections|visites-terrain|paiements-terrain|zones|objectifs-mensuels|agent-geolocations)(?:\/|$)/,
      /^\/api\/supervision\/prospection[^/]*(?:\/|$)/,
      /^\/api\/prospection-prime[^/]*(?:\/|$)/,
    ],
  },
  {
    feature: "enableSms",
    paths: [
      /^\/api\/sms(?:\/|$)/,
      /^\/api\/settings\/sms-templates(?:\/|$)/,
      /^\/api\/webhooks\/mtn\/sms-[^/]+(?:\/|$)/,
    ],
  },
  {
    feature: "enableCredits",
    paths: [
      /^\/api\/credits(?:\/|$)/,
      /^\/api\/remboursements(?:\/|$)/,
    ],
  },
  {
    feature: "enableComptes",
    paths: [/^\/api\/comptes(?:\/|$)/],
  },
  {
    feature: "enableCaisse",
    paths: [
      /^\/api\/caisse(?:\/|$)/,
      /^\/api\/caisses(?:\/|$)/,
      /^\/api\/caisse-transferts(?:\/|$)/,
      /^\/api\/sessions-caisse(?:\/|$)/,
      /^\/api\/operations-caisse(?:\/|$)/,
    ],
  },
  {
    feature: "enableCoffreFort",
    paths: [
      /^\/api\/coffre(?:\/|$)/,
      /^\/api\/transferts-inter-coffres(?:\/|$)/,
      /^\/api\/evacuations-coffre(?:\/|$)/,
    ],
  },
  {
    feature: "enableTransfert",
    paths: [/^\/api\/transferts(?:\/|$)/],
  },
  {
    feature: "enableComptabilite",
    paths: [/^\/api\/comptabilite(?:\/|$)/],
  },
  {
    feature: "enableKpi",
    paths: [/^\/api\/kpi(?:\/|$)/],
  },
  {
    feature: "enableRH",
    paths: [
      /^\/api\/hr(?:\/|$)/,
      /^\/api\/departments(?:\/|$)/,
    ],
  },
  // enableTresorerie / enableVirementsProgrammes / enableRapports : masqués côté
  // nav + admin, mais sans garde API dédiée ici (pas de préfixe /api propre et
  // vérifié). Leurs endpoints restent protégés par RBAC. Ajouter une règle ici
  // dès qu'un préfixe stable est confirmé.
];

export function getRequiredTenantFeature(path: string): TenantFeatureKey | undefined {
  return FEATURE_ROUTE_RULES.find(rule => rule.paths.some(pattern => pattern.test(path)))?.feature;
}

export function enforceTenantFeatures(req: Request, res: Response, next: NextFunction): void {
  const feature = getRequiredTenantFeature(req.path);
  if (!feature) {
    next();
    return;
  }

  getEffectiveFeatures()
    .then((features) => {
      if (features[feature]) {
        next();
        return;
      }
      res.status(404).json({
        code: "FEATURE_DISABLED",
        message: "Cette fonctionnalité n'est pas disponible pour ce déploiement.",
      });
    })
    .catch(() => {
      // Repli sûr : configuration statique validée au démarrage.
      if (getTenantConfig().features[feature]) {
        next();
        return;
      }
      res.status(404).json({
        code: "FEATURE_DISABLED",
        message: "Cette fonctionnalité n'est pas disponible pour ce déploiement.",
      });
    });
}
