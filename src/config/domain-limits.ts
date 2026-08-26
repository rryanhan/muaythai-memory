export const DRILL_LIMITS = {
  titleCharacters: 120,
  summaryCharacters: 1_000,
  notesCharacters: 5_000,
  stepCharacters: 500,
  steps: 50,
  trainingMethods: 10,
  tags: 100,
  savedLists: 2,
  filterKeywords: 10,
  filterKeywordCharacters: 100,
  slugCharacters: 96,
} as const;

export const CAPTURE_LIMITS = {
  transcriptCharacters: 12_000,
  burstAttempts: 5,
  burstWindowMs: 10 * 60 * 1_000,
  transcriptionDailyAttempts: 20,
  cleanupDailyAttempts: 40,
  dailyWindowMs: 24 * 60 * 60 * 1_000,
  openAiCleanupTimeoutMs: 60_000,
} as const;
