-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tenants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clerk_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_tenants" ("clerk_user_id", "created_at", "email", "id", "name", "plan", "role") SELECT "clerk_user_id", "created_at", "email", "id", "name", "plan", "role" FROM "tenants";
DROP TABLE "tenants";
ALTER TABLE "new_tenants" RENAME TO "tenants";
CREATE UNIQUE INDEX "tenants_clerk_user_id_key" ON "tenants"("clerk_user_id");
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
