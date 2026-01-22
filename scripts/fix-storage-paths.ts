/**
 * SCRIPT DE MIGRATION - Assainissement des Chemins de Stockage
 *
 * Ce script:
 * 1. Consolide les champs photos (users.photoProfile > clients.photoProfile)
 * 2. Nettoie les URLs malformées (supprime les préfixes HTTP, double-slashs)
 * 3. Standardise tous les chemins vers des Object Keys uniquement
 *
 * Usage: npx tsx scripts/fix-storage-paths.ts // DRY_RUN=false npx tsx scripts/fix-storage-paths.ts
 */

// Charger les variables d'environnement
import 'dotenv/config';

import { db } from '../server/db';
import { users, clients, documents } from '../shared/schema';
import { sql, isNotNull } from 'drizzle-orm';

// Configuration
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Par défaut: mode simulation
const VERBOSE = process.env.VERBOSE === 'true';

// Patterns à nettoyer
const URL_PATTERNS = [
  /^https?:\/\/[^/]+\/public-assets\//,
  /^https?:\/\/[^/]+\/secure-docs\//,
  /^https?:\/\/localhost:\d+\/public-assets\//,
  /^https?:\/\/localhost:\d+\/secure-docs\//,
  /^https?:\/\/minio[^/]*\/public-assets\//,
  /^https?:\/\/minio[^/]*\/secure-docs\//,
];

// Double-prefix pattern (http://host/bucket/http://host/bucket/key)
const DOUBLE_PREFIX_PATTERN = /^(https?:\/\/[^/]+\/[^/]+\/)(https?:\/\/.+)$/;

interface MigrationStats {
  usersScanned: number;
  usersUpdated: number;
  clientsScanned: number;
  clientsPhotoMigrated: number;
  clientsDocumentsFixed: number;
  documentsScanned: number;
  documentsFixed: number;
  errors: string[];
}

const stats: MigrationStats = {
  usersScanned: 0,
  usersUpdated: 0,
  clientsScanned: 0,
  clientsPhotoMigrated: 0,
  clientsDocumentsFixed: 0,
  documentsScanned: 0,
  documentsFixed: 0,
  errors: [],
};

/**
 * Extrait l'Object Key d'une URL ou retourne le chemin tel quel
 */
function extractObjectKey(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Ignorer les data URIs et URLs externes (Google, etc.)
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('https://lh3.googleusercontent.com')) return trimmed;
  if (trimmed.startsWith('https://graph.facebook.com')) return trimmed;

  // Corriger double-prefix d'abord
  const doubleMatch = trimmed.match(DOUBLE_PREFIX_PATTERN);
  if (doubleMatch) {
    // Récursion pour nettoyer l'URL interne
    return extractObjectKey(doubleMatch[2]);
  }

  // Si c'est une URL MinIO, extraire le chemin
  for (const pattern of URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      const cleaned = trimmed.replace(pattern, '');
      // Nettoyer les double-slashs
      return cleaned.replace(/\/+/g, '/').replace(/^\//, '');
    }
  }

  // Si ça commence par http mais n'est pas MinIO, c'est peut-être une URL externe valide
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // Vérifier si c'est un bucket connu
      if (pathParts[0] === 'public-assets' || pathParts[0] === 'secure-docs') {
        const key = pathParts.slice(1).join('/');
        return key.replace(/\/+/g, '/');
      }

      // URL externe inconnue, la garder telle quelle
      return trimmed;
    } catch {
      // URL invalide, retourner null
      return null;
    }
  }

  // C'est déjà un chemin relatif, nettoyer les double-slashs
  const cleaned = trimmed.replace(/\/+/g, '/').replace(/^\//, '');

  // Supprimer le préfixe bucket si présent dans le chemin
  if (cleaned.startsWith('public-assets/')) {
    return cleaned.replace('public-assets/', '');
  }
  if (cleaned.startsWith('secure-docs/')) {
    return cleaned.replace('secure-docs/', '');
  }

  return cleaned || null;
}

/**
 * Nettoie un tableau de documents (JSONB)
 */
function cleanDocumentsArray(docs: any[]): { cleaned: any[]; changed: boolean } {
  let changed = false;

  const cleaned = docs.map(doc => {
    if (!doc) return doc;

    const newDoc = { ...doc };

    // Nettoyer documentUrl
    if (doc.documentUrl) {
      const cleanedUrl = extractObjectKey(doc.documentUrl);
      if (cleanedUrl !== doc.documentUrl) {
        newDoc.documentUrl = cleanedUrl;
        changed = true;
        if (VERBOSE) {
          console.log(`  📄 Document URL: "${doc.documentUrl}" → "${cleanedUrl}"`);
        }
      }
    }

    // Nettoyer objectKey si présent
    if (doc.objectKey) {
      const cleanedKey = extractObjectKey(doc.objectKey);
      if (cleanedKey !== doc.objectKey) {
        newDoc.objectKey = cleanedKey;
        changed = true;
      }
    }

    // Nettoyer url si présent
    if (doc.url) {
      const cleanedUrl = extractObjectKey(doc.url);
      if (cleanedUrl !== doc.url) {
        newDoc.url = cleanedUrl;
        changed = true;
      }
    }

    return newDoc;
  });

  return { cleaned, changed };
}

async function migrateUsers(): Promise<void> {
  console.log('\n📸 Phase 1: Migration des photos utilisateurs...');

  const allUsers = await db.select({
    id: users.id,
    nom: users.nom,
    photoProfile: users.photoProfile,
  }).from(users).where(isNotNull(users.photoProfile));

  stats.usersScanned = allUsers.length;
  console.log(`   Trouvé ${allUsers.length} utilisateurs avec photo`);

  for (const user of allUsers) {
    const cleanedPhoto = extractObjectKey(user.photoProfile);

    if (cleanedPhoto !== user.photoProfile) {
      if (VERBOSE) {
        console.log(`   👤 ${user.nom}: "${user.photoProfile}" → "${cleanedPhoto}"`);
      }

      if (!DRY_RUN) {
        await db.update(users)
          .set({ photoProfile: cleanedPhoto })
          .where(sql`${users.id} = ${user.id}`);
      }

      stats.usersUpdated++;
    }
  }

  console.log(`   ✅ ${stats.usersUpdated} photos utilisateurs nettoyées`);
}

async function migrateClientPhotos(): Promise<void> {
  console.log('\n🖼️  Phase 2: Migration des photos clients (Legacy → Users)...');

  // Récupérer les clients avec photoProfile legacy mais pas de photo dans users
  const clientsWithLegacyPhoto = await db.execute(sql`
    SELECT
      c.id as client_id,
      c.user_id,
      c.photo_profile as client_photo,
      u.photo_profile as user_photo,
      u.nom
    FROM clients c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.photo_profile IS NOT NULL
      AND (u.photo_profile IS NULL OR u.photo_profile = '')
      AND c.user_id IS NOT NULL
  `);

  const rows = clientsWithLegacyPhoto.rows as any[];
  stats.clientsScanned = rows.length;
  console.log(`   Trouvé ${rows.length} clients avec photo legacy à migrer`);

  for (const row of rows) {
    const cleanedPhoto = extractObjectKey(row.client_photo);

    if (cleanedPhoto) {
      if (VERBOSE) {
        console.log(`   📋 Client ${row.nom}: Migrating photo to user`);
      }

      if (!DRY_RUN) {
        // Mettre à jour la photo dans users
        await db.update(users)
          .set({ photoProfile: cleanedPhoto })
          .where(sql`${users.id} = ${row.user_id}`);
      }

      stats.clientsPhotoMigrated++;
    }
  }

  // Nettoyer les photos clients qui ont des URLs malformées
  const clientsWithPhoto = await db.execute(sql`
    SELECT id, photo_profile, nom
    FROM clients
    WHERE photo_profile IS NOT NULL
  `);

  for (const row of (clientsWithPhoto.rows as any[])) {
    const cleanedPhoto = extractObjectKey(row.photo_profile);

    if (cleanedPhoto !== row.photo_profile) {
      if (VERBOSE) {
        console.log(`   🔧 Client ${row.nom}: "${row.photo_profile}" → "${cleanedPhoto}"`);
      }

      if (!DRY_RUN) {
        await db.execute(sql`
          UPDATE clients SET photo_profile = ${cleanedPhoto}
          WHERE id = ${row.id}::uuid
        `);
      }
    }
  }

  console.log(`   ✅ ${stats.clientsPhotoMigrated} photos migrées vers users`);
}

async function migrateClientDocuments(): Promise<void> {
  console.log('\n📁 Phase 3: Nettoyage des documents clients (JSONB)...');

  const clientsWithDocs = await db.execute(sql`
    SELECT id, nom, documents
    FROM clients
    WHERE documents IS NOT NULL
      AND jsonb_array_length(documents) > 0
  `);

  const rows = clientsWithDocs.rows as any[];
  console.log(`   Trouvé ${rows.length} clients avec documents`);

  for (const row of rows) {
    try {
      const docs = Array.isArray(row.documents) ? row.documents : [];
      const { cleaned, changed } = cleanDocumentsArray(docs);

      if (changed) {
        if (VERBOSE) {
          console.log(`   📂 Client ${row.nom}: ${docs.length} documents nettoyés`);
        }

        if (!DRY_RUN) {
          await db.execute(sql`
            UPDATE clients SET documents = ${JSON.stringify(cleaned)}::jsonb
            WHERE id = ${row.id}::uuid
          `);
        }

        stats.clientsDocumentsFixed++;
      }
    } catch (error) {
      const errMsg = `Erreur client ${row.id}: ${error}`;
      stats.errors.push(errMsg);
      console.error(`   ❌ ${errMsg}`);
    }
  }

  console.log(`   ✅ ${stats.clientsDocumentsFixed} clients avec documents nettoyés`);
}

async function migrateDocumentsTable(): Promise<void> {
  console.log('\n📄 Phase 4: Nettoyage de la table documents...');

  const allDocs = await db.select({
    id: documents.id,
    nom: documents.nom,
    objectPath: documents.objectPath,
    chemin: documents.chemin,
  }).from(documents).where(isNotNull(documents.objectPath));

  stats.documentsScanned = allDocs.length;
  console.log(`   Trouvé ${allDocs.length} documents`);

  for (const doc of allDocs) {
    const cleanedPath = extractObjectKey(doc.objectPath);

    if (cleanedPath !== doc.objectPath) {
      if (VERBOSE) {
        console.log(`   📜 ${doc.nom}: "${doc.objectPath}" → "${cleanedPath}"`);
      }

      if (!DRY_RUN) {
        await db.update(documents)
          .set({ objectPath: cleanedPath })
          .where(sql`${documents.id} = ${doc.id}`);
      }

      stats.documentsFixed++;
    }
  }

  console.log(`   ✅ ${stats.documentsFixed} documents nettoyés`);
}

async function generateReport(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RAPPORT DE MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? '🔍 SIMULATION (dry-run)' : '✅ EXÉCUTION RÉELLE'}`);
  console.log('');
  console.log('📸 Utilisateurs:');
  console.log(`   - Scannés: ${stats.usersScanned}`);
  console.log(`   - Mis à jour: ${stats.usersUpdated}`);
  console.log('');
  console.log('👥 Clients:');
  console.log(`   - Scannés: ${stats.clientsScanned}`);
  console.log(`   - Photos migrées vers users: ${stats.clientsPhotoMigrated}`);
  console.log(`   - Documents JSONB nettoyés: ${stats.clientsDocumentsFixed}`);
  console.log('');
  console.log('📄 Documents (table):');
  console.log(`   - Scannés: ${stats.documentsScanned}`);
  console.log(`   - Nettoyés: ${stats.documentsFixed}`);
  console.log('');

  if (stats.errors.length > 0) {
    console.log('❌ Erreurs:');
    stats.errors.forEach(err => console.log(`   - ${err}`));
  } else {
    console.log('✅ Aucune erreur');
  }

  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  Mode simulation activé. Pour exécuter réellement:');
    console.log('   DRY_RUN=false npx tsx scripts/fix-storage-paths.ts');
  }
}

async function main(): Promise<void> {
  console.log('🚀 Démarrage de la migration des chemins de stockage...');
  console.log(`   Mode: ${DRY_RUN ? 'SIMULATION' : 'EXÉCUTION'}`);
  console.log(`   Verbose: ${VERBOSE ? 'OUI' : 'NON'}`);

  try {
    await migrateUsers();
    await migrateClientPhotos();
    await migrateClientDocuments();
    await migrateDocumentsTable();
    await generateReport();

    console.log('\n✅ Migration terminée avec succès!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Exécuter
main();
