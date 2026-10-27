-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "occasionDate" TEXT,
    "introduction" TEXT NOT NULL DEFAULT '',
    "coverFile" TEXT,
    "coverDisplayFile" TEXT,
    "coverAlt" TEXT NOT NULL DEFAULT '',
    "layout" TEXT NOT NULL DEFAULT 'gallery',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "contributionsCloseAt" TEXT,
    "presentedAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'owner',
    "status" TEXT NOT NULL DEFAULT 'visible',
    "position" REAL NOT NULL DEFAULT 0,
    "reviewedBy" TEXT,
    "reviewedAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    CONSTRAINT "Post_ownerId_boardId_fkey" FOREIGN KEY ("ownerId", "boardId") REFERENCES "Board" ("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "originalFile" TEXT,
    "displayFile" TEXT,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    CONSTRAINT "Media_ownerId_boardId_postId_fkey" FOREIGN KEY ("ownerId", "boardId", "postId") REFERENCES "Post" ("ownerId", "boardId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoardMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    CONSTRAINT "BoardMember_ownerId_boardId_fkey" FOREIGN KEY ("ownerId", "boardId") REFERENCES "Board" ("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoardPreference" (
    "ownerId" TEXT NOT NULL PRIMARY KEY,
    "language" TEXT NOT NULL,
    "appearance" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Board_ownerId_status_id_idx" ON "Board"("ownerId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Board_ownerId_id_key" ON "Board"("ownerId", "id");

-- CreateIndex
CREATE INDEX "Post_ownerId_boardId_status_position_id_idx" ON "Post"("ownerId", "boardId", "status", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Post_ownerId_boardId_id_key" ON "Post"("ownerId", "boardId", "id");

-- CreateIndex
CREATE INDEX "Media_ownerId_boardId_postId_position_id_idx" ON "Media"("ownerId", "boardId", "postId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BoardMember_ownerId_boardId_personId_role_key" ON "BoardMember"("ownerId", "boardId", "personId", "role");
