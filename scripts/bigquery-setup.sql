-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — BigQuery External Tables
-- Points to NDJSON files in GCS for on-demand analytics
-- Run in BigQuery Console: https://console.cloud.google.com/bigquery
-- Project: project-f050b6ba-60db-4eee-98a
-- ═══════════════════════════════════════════════════════

-- Create dataset first
CREATE SCHEMA IF NOT EXISTS `project-f050b6ba-60db-4eee-98a.firstlight`;

-- Daily Rituals
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.daily_rituals`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/daily_rituals.ndjson']);

-- Journal Entries
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.journal_entries`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/journal_entries.ndjson']);

-- Daily Logs
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.daily_logs`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/daily_logs.ndjson']);

-- Mastery Daily
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.mastery_daily`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/mastery_daily.ndjson']);

-- Brahma Daily
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.brahma_daily`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/brahma_daily.ndjson']);

-- Gym Workouts
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.gym_workouts`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/gym_workouts.ndjson']);

-- Comments
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.comments`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/comments.ndjson']);

-- Voice Entries
CREATE OR REPLACE EXTERNAL TABLE `project-f050b6ba-60db-4eee-98a.firstlight.voice_entries`
OPTIONS (format = 'JSON', uris = ['gs://firstlightlive_archive/firstlight/*/voice_entries.ndjson']);

-- ═══════════════════════════════════════════════════════
-- SAMPLE QUERIES (run these anytime to analyze your data)
-- ═══════════════════════════════════════════════════════

-- How many days have I tracked?
-- SELECT COUNT(*) as total_days FROM `project-f050b6ba-60db-4eee-98a.firstlight.daily_logs`;

-- Average sleep per month
-- SELECT EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', date)) as month, AVG(CAST(sleep_hrs AS FLOAT64)) as avg_sleep
-- FROM `project-f050b6ba-60db-4eee-98a.firstlight.daily_logs`
-- GROUP BY month ORDER BY month;

-- Mastery completion trend
-- SELECT date, CAST(completion_pct AS INT64) as pct
-- FROM `project-f050b6ba-60db-4eee-98a.firstlight.mastery_daily`
-- ORDER BY date DESC LIMIT 30;

-- Gym volume by week
-- SELECT date, split, JSON_VALUE(exercises) as exercises
-- FROM `project-f050b6ba-60db-4eee-98a.firstlight.gym_workouts`
-- ORDER BY date DESC;
