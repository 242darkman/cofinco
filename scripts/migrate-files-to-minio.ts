import 'dotenv/config';
import { db } from '../server/db';
import { users, clients, enquetesCredit, sanctions, candidatures } from '../shared/schema';
import { StorageService } from '../server/services/storage-service';
import { eq, isNotNull, or } from 'drizzle-orm';

async function migrateBase64ToMinIO() {
  console.log('🚀 Starting migration from Base64 to MinIO...\n');

  try {
    // Initialize MinIO buckets
    await StorageService.initializeBuckets();

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // ========== Migrate User Profile Photos ==========
    console.log('\n📸 Migrating user profile photos...');
    const usersWithPhotos = await db
      .select()
      .from(users)
      .where(isNotNull(users.photoProfile));

    console.log(`   Found ${usersWithPhotos.length} users with photos`);

    for (const user of usersWithPhotos) {
      try {
        if (!user.photoProfile || !user.photoProfile.startsWith('data:')) {
          skippedCount++;
          continue;
        }

        const newKey = await uploadBase64(user.photoProfile, `profiles/${user.id}`, true);
        if (newKey) {
          await db.update(users).set({ photoProfile: newKey }).where(eq(users.id, user.id));
          migratedCount++;
          console.log(`   ✅ Migrated user ${user.username || user.id}`);
        }
      } catch (error: any) {
        console.error(`   ❌ Error migrating user ${user.id}:`, error.message);
        errorCount++;
      }
    }

    // ========== Migrate Client Photos (KYC) ==========
    console.log('\n📸 Migrating client photos (KYC)...');
    const clientsWithPhotos = await db
      .select()
      .from(clients)
      .where(or(isNotNull(clients.photoProfile), isNotNull(clients.photoUrl)));

    console.log(`   Found ${clientsWithPhotos.length} clients with photos`);

    for (const client of clientsWithPhotos) {
      try {
        const photoData = client.photoProfile || client.photoUrl;
        
        if (!photoData) {
          skippedCount++;
          continue;
        }

        // Check for JSON Array (Legacy documents storage abuse)
        if (photoData.trim().startsWith('[')) {
            try {
                const docs = JSON.parse(photoData);
                if (Array.isArray(docs)) {
                    let updatedDocs = [];
                    let hasBase64 = false;

                    for (let i = 0; i < docs.length; i++) {
                        const doc = docs[i];
                        if (doc.document_url && doc.document_url.startsWith('data:')) {
                            // Determine folder based on type
                            const folder = doc.document_type === 'Contract' ? 'contracts' : 'clients/kyc';
                            // Use ID from doc or generate one
                            const docId = doc.id || `migrated_${Date.now()}_${i}`;
                             const key = await uploadBase64(doc.document_url, `${folder}/${client.id}/${docId}`, false);
                             
                             if (key) {
                                 updatedDocs.push({ ...doc, document_url: key });
                                 hasBase64 = true;
                                 console.log(`     - Migrated document ${doc.document_name}`);
                             } else {
                                 updatedDocs.push(doc);
                             }
                        } else {
                            updatedDocs.push(doc);
                        }
                    }

                    if (hasBase64 || docs.length > 0) {
                        // Move to 'documents' column and clear 'photoUrl' if it was the source
                        // If source was photoProfile, clear that too? Usually photoProfile is single string.
                        // Assuming this JSON blob came from photoUrl usually.
                        
                        // We set documents column.
                        await db.update(clients)
                           .set({ 
                               documents: updatedDocs,
                               photoUrl: null // Clear legacy
                           })
                           .where(eq(clients.id, client.id));
                        
                        migratedCount++;
                        console.log(`   ✅ Migrated ${updatedDocs.length} documents for client ${client.id}`);
                        continue; // Done with this client
                    }
                }
            } catch (e) {
                console.log(`   ⚠️  Failed to parse JSON for client ${client.id}, treating as string`);
            }
        }

        if (!photoData.startsWith('data:')) {
          skippedCount++;
          continue;
        }

        const newKey = await uploadBase64(photoData, `clients/kyc/${client.id}`, false); // Private
        if (newKey) {
          await db
            .update(clients)
            .set({ photoProfile: newKey, photoUrl: null })
            .where(eq(clients.id, client.id));
          migratedCount++;
          console.log(`   ✅ Migrated client ${client.id}`);
        }
      } catch (error: any) {
        console.error(`   ❌ Error migrating client ${client.id}:`, error.message);
        errorCount++;
      }
    }

    // ========== Migrate Enquetes Credit (Arrays) ==========
    console.log('\n📂 Migrating Enquetes Credit (Photos & Docs)...');
    const enquetes = await db.select().from(enquetesCredit);
    
    for (const enquete of enquetes) {
        let updated = false;
        const updates: any = {};

        // 1. Photos Activité (Array)
        if (enquete.photosActivite && enquete.photosActivite.length > 0) {
            const newPhotos = [];
            let changed = false;
            for (let i = 0; i < enquete.photosActivite.length; i++) {
                const photo = enquete.photosActivite[i];
                if (photo && photo.startsWith('data:')) {
                    const key = await uploadBase64(photo, `credit-investigations/${enquete.id}/photo_${i}`, false);
                    if (key) {
                        newPhotos.push(key);
                        changed = true;
                    } else {
                        newPhotos.push(photo); // Keep original if fail
                    }
                } else {
                    newPhotos.push(photo);
                }
            }
            if (changed) {
                updates.photosActivite = newPhotos;
                updated = true;
            }
        }

        // 2. Doc Justificatifs (Array)
        if (enquete.documentsJustificatifs && enquete.documentsJustificatifs.length > 0) {
             const newDocs = [];
            let changed = false;
            for (let i = 0; i < enquete.documentsJustificatifs.length; i++) {
                const doc = enquete.documentsJustificatifs[i];
                if (doc && doc.startsWith('data:')) {
                    const key = await uploadBase64(doc, `credit-investigations/${enquete.id}/doc_${i}`, false);
                    if (key) {
                        newDocs.push(key);
                        changed = true;
                    } else {
                        newDocs.push(doc);
                    }
                } else {
                    newDocs.push(doc);
                }
            }
            if (changed) {
                updates.documentsJustificatifs = newDocs;
                updated = true;
            }
        }

        if (updated) {
            await db.update(enquetesCredit).set(updates).where(eq(enquetesCredit.id, enquete.id));
            migratedCount++;
            console.log(`   ✅ Migrated enquete ${enquete.id}`);
        }
    }

    // ========== Migrate HR Candidatures ==========
    console.log('\n👔 Migrating HR Candidatures...');
    const candidats = await db.select().from(candidatures);
    for (const c of candidats) {
        let updated = false;
        const updates: any = {};

        if (c.cvUrl && c.cvUrl.startsWith('data:')) {
            const key = await uploadBase64(c.cvUrl, `hr/candidates/${c.id}/cv`, false);
            if (key) {
                updates.cvUrl = key;
                updated = true;
            }
        }
         if (c.lettreMotivationUrl && c.lettreMotivationUrl.startsWith('data:')) {
            const key = await uploadBase64(c.lettreMotivationUrl, `hr/candidates/${c.id}/lm`, false);
            if (key) {
                updates.lettreMotivationUrl = key;
                updated = true;
            }
        }

        if (updated) {
            await db.update(candidatures).set(updates).where(eq(candidatures.id, c.id));
            migratedCount++;
            console.log(`   ✅ Migrated candidature ${c.id}`);
        }
    }

    // ========== Summary ==========
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(50));
    console.log(`   ✅ Successfully migrated items: ${migratedCount}`);
    console.log(`   ⏭️  Skipped items:             ${skippedCount}`);
    console.log(`   ❌ Errors:                     ${errorCount}`);
    console.log('='.repeat(50));

    console.log('\n✨ Migration complete!');

  } catch (error: any) {
    console.error('\n💥 Fatal error during migration:', error);
    throw error;
  }
}

// Helper function to handle base64 upload
async function uploadBase64(base64String: string, pathPrefix: string, isPublic: boolean): Promise<string | null> {
    try {
        const matches = base64String.match(/^data:(.+);base64,(.+)$/);
        if (!matches) return null;

        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = contentType.split('/')[1] || 'bin';
        // Cleanup extension if it contains +xml or similar (e.g. svg+xml)
        const cleanExt = ext.split('+')[0];

        const filename = `${pathPrefix.split('/').pop()}.${cleanExt}`;
        const folder = pathPrefix.substring(0, pathPrefix.lastIndexOf('/'));
        
        // If filename was passed as part of prefix, use it. 
        // Logic adjustment: pathPrefix includes filename basis? 
        // Let's assume pathPrefix is full path WITHOUT extension.
        
        const fullPath = `${pathPrefix}.${cleanExt}`; // "profiles/123.jpg"
        // But StorageService.uploadBuffer takes (buffer, filename, contentType, path, isPublic)
        // path + filename = key
        
        // We need to split path and filename logic properly for StorageService
        // Or create a direct upload helper? 
        // StorageService.uploadBuffer implementations joins path + filename.
        
        // Let's extract directory and filename
        const parts = fullPath.split('/');
        const fileNameWithExt = parts.pop()!;
        const directory = parts.join('/');

        return await StorageService.uploadBuffer(
          buffer,
          fileNameWithExt,
          contentType,
          directory,
          isPublic
        );
    } catch (e) {
        console.error("Base64 upload failed", e);
        return null;
    }
}

// Run migration
migrateBase64ToMinIO()
  .then(() => {
    console.log('\n👋 Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💀 Migration failed:', error);
    process.exit(1);
  });
