export const RULE_VERSION = "2026-10.1";

/**
 * Every threshold of the classifier lives here. The numbers were set by reasoning
 * before any run; only the structure around them changed after looking at
 * data/dataset.json (see README, "Como os limites foram escolhidos").
 */
export const RULES = {
  minHours: 48,
  minTotalViews: 100,
  maxHours: 24 * 90,

  spike: {
    /** The baseline is the median of this many hours before the peak (or of the whole series if the peak is earlier than minHoursBefore). */
    baselineHours: 48,
    minHoursBefore: 12,
    /** Highest hour must be at least this many times the baseline... */
    riseRatio: 8,
    /** ...at least this many views above it... */
    minExcess: 300,
    /** ...and this many robust deviations (1.4826 * MAD) above it. */
    robustZ: 8,
    /** The "high phase" is the run around the peak above this share of the excess. */
    highPhaseShare: 0.5,
    /** The tail is the run after it that stays above this share of the excess. */
    tailShare: 0.1,
    /** Tail of this many hours or fewer = cliff (strong). */
    cliffMaxTailHours: 1,
    /** Tail of this many hours or fewer, but more than a cliff = partial (moderate). */
    partialMaxTailHours: 4,
    /** For the daily-rhythm signal, an event lasts until the series is back under this many times the median. */
    eventEndRatio: 1.5,
    /** Hours after the high phase needed to judge the tail. */
    minHoursAfter: 3,
  },

  regularity: {
    windowHours: 12,
    maxCv: 0.03,
    minMeanViews: 50,
    moderateRunHours: 12,
    strongRunHours: 24,
  },

  repeats: {
    minValue: 20,
    strongRunHours: 6,
  },

  roundNumbers: {
    step: 100,
    minValue: 500,
    moderateRunHours: 6,
  },

  circadian: {
    deadHours: [2, 3, 4, 5],
    activeHours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    minActiveMedian: 20,
    minTotalViews: 2000,
    minDeadSamples: 8,
    minActiveSamples: 24,
    moderateRatio: 0.8,
  },

  purge: {
    moderatePercent: 0.5,
    strongPercent: 3,
  },

  dropToZero: {
    lookbackHours: 24,
    minPriorMedian: 100,
    nearZeroShare: 0.02,
    minHoursAtZero: 6,
    minLastHourShare: 0.5,
  },
} as const;
