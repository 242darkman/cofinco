"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.pool = void 0;
var node_postgres_1 = require("drizzle-orm/node-postgres");
var pg_1 = require("pg");
var schema = require("@shared/schema");
var Pool = pg_1.default.Pool;
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}
exports.pool = new Pool({ connectionString: process.env.DATABASE_URL });
exports.db = (0, node_postgres_1.drizzle)(exports.pool, { schema: schema });
