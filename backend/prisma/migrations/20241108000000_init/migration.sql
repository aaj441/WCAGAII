-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "api_key" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "request_limit" INTEGER NOT NULL DEFAULT 100,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "url" TEXT,
    "violations_count" INTEGER NOT NULL DEFAULT 0,
    "passes_count" INTEGER NOT NULL DEFAULT 0,
    "incomplete_count" INTEGER NOT NULL DEFAULT 0,
    "wcag_level" TEXT NOT NULL DEFAULT 'AA',
    "duration" INTEGER NOT NULL,
    "scan_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "viewport" JSONB,
    "options" JSONB,
    "violations" JSONB,
    "passes" JSONB,
    "incomplete" JSONB,
    "ai_recommendations" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "event_type" TEXT NOT NULL,
    "event_action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "correlation_id" TEXT,
    "metadata" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cpu" DOUBLE PRECISION,
    "memory" DOUBLE PRECISION,
    "request_count" INTEGER,
    "error_count" INTEGER,
    "avg_latency" DOUBLE PRECISION,
    "metadata" JSONB,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key_usage" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "api_key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_api_key_idx" ON "users"("api_key");

-- CreateIndex
CREATE INDEX "scans_user_id_idx" ON "scans"("user_id");

-- CreateIndex
CREATE INDEX "scans_scan_date_idx" ON "scans"("scan_date");

-- CreateIndex
CREATE INDEX "scans_type_idx" ON "scans"("type");

-- CreateIndex
CREATE INDEX "scans_wcag_level_idx" ON "scans"("wcag_level");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs"("event_type");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");

-- CreateIndex
CREATE INDEX "system_health_service_idx" ON "system_health"("service");

-- CreateIndex
CREATE INDEX "system_health_timestamp_idx" ON "system_health"("timestamp");

-- CreateIndex
CREATE INDEX "api_key_usage_api_key_idx" ON "api_key_usage"("api_key");

-- CreateIndex
CREATE INDEX "api_key_usage_timestamp_idx" ON "api_key_usage"("timestamp");

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
