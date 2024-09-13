-- CreateEnum
CREATE TYPE "Proto" AS ENUM ('ICMP', 'TCP');

-- CreateEnum
CREATE TYPE "MonitorTrigger" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateTable
CREATE TABLE "MonitorDevice" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "port" INTEGER,
    "proto" "Proto" NOT NULL DEFAULT 'ICMP',
    "persist" BOOLEAN NOT NULL,
    "monitor_trigger" "MonitorTrigger" NOT NULL,
    "monitor_start_utc" INTEGER NOT NULL,
    "monitor_end_utc" INTEGER NOT NULL,
    "requested_by" TEXT NOT NULL,
    "notify" TEXT NOT NULL,
    "comments" TEXT,
    "email_subject" TEXT NOT NULL,
    "email_body" TEXT,
    "been_notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MonitorDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("username")
);
