/**
 * Skeleton — façade préservant le chemin d'import historique.
 *
 * Les responsabilités sont découpées dans `./skeleton/` :
 * - `Skeleton.tsx` : primitive (variantes, animation shimmer) ;
 * - `generic-presets.tsx` : texte, avatar, carte, tableau, stats, liste,
 *   formulaire, tableau de bord ;
 * - `domain-presets.tsx` : tontines, clients, crédits, transactions, carte CB.
 */

import { Skeleton } from './skeleton/Skeleton';

export { Skeleton } from './skeleton/Skeleton';
export {
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonTable,
  SkeletonStatCard,
  SkeletonList,
  SkeletonStatsGrid,
  SkeletonForm,
  SkeletonDashboard,
} from './skeleton/generic-presets';
export {
  SkeletonMemberCard,
  SkeletonContributionCard,
  SkeletonClientItem,
  SkeletonCreditItem,
  SkeletonTransactionRow,
  SkeletonTransactionList,
  SkeletonBankCard,
} from './skeleton/domain-presets';

export default Skeleton;
