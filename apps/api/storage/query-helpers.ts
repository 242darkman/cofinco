import { isNull } from "drizzle-orm";

export const notDeleted = <T extends { deletedAt: any }>(table: T) => isNull(table.deletedAt);
