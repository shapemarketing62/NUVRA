ALTER TABLE "StrategicAction"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "StrategicAction"
SET "status" = CASE WHEN "done" = TRUE THEN 'completed' ELSE 'pending' END;
