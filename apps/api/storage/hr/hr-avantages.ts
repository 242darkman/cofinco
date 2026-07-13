import {
  Avantage,
  AvantageEmploye,
  avantages,
  avantagesEmployes, InsertAvantageEmploye
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../db";

// Avantages
export async function getAllAvantages(): Promise<Avantage[]> {
    return await db.select().from(avantages).where(eq(avantages.actif, true));
}

export async function getAvantagesEmploye(employeId: string): Promise<any[]> {
    return await db.select({
        id: avantagesEmployes.id,
        avantageId: avantages.id,
        nom: avantages.nom,
        type: avantages.type,
        montant: avantagesEmployes.montant,
        dateAttribution: avantagesEmployes.dateAttribution,
        modeCalcul: avantages.modeCalcul,
        pourcentage: avantages.pourcentage,
        frequence: avantages.frequence,
        imposable: avantages.imposable,
        soumisCnss: avantages.soumisCnss,
        categorie: avantages.categorie,
    })
    .from(avantagesEmployes)
    .innerJoin(avantages, eq(avantagesEmployes.avantageId, avantages.id))
    .where(eq(avantagesEmployes.employeId, employeId));
}

export async function assignAvantage(data: InsertAvantageEmploye): Promise<AvantageEmploye> {
    const [assigned] = await db.insert(avantagesEmployes).values(data).returning();
    return assigned;
}
