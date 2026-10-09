export type Label = "legitimo" | "suspeito" | "inconclusivo";

export type Mode = "increment" | "cumulative";

export interface ClassifyInput {
  /** IANA zone of the audience. Default: America/Sao_Paulo. */
  timezone?: string;
  /** ISO-8601 instant of the first hour bin (use a full hour). */
  start: string;
  /** Views per hour (mode "increment") or running total at each full hour (mode "cumulative"). */
  views: number[];
  /** Default: "increment". */
  mode?: Mode;
}

export type SignalId =
  | "spike_shape"
  | "mechanical_regularity"
  | "repeated_values"
  | "round_numbers"
  | "circadian_mismatch"
  | "purge_drop"
  | "drop_to_zero";

/**
 * none: nothing to see. moderate / strong: evidence against the series.
 * undetermined: the data cannot answer (e.g. the spike is at the end of the series).
 */
export type Severity = "none" | "moderate" | "strong" | "undetermined";

export interface Signal {
  id: SignalId;
  /** The measured number; null when the signal does not apply to this series. */
  value: number | null;
  unit: string;
  /** Value that makes the signal at least moderate. */
  threshold: number;
  /** Value that makes it strong; null when the signal can never be strong. */
  strong_threshold: number | null;
  comparison: ">=" | "<=";
  triggered: boolean;
  severity: Severity;
  explanation: string;
  evidence: Record<string, number | string>;
}

export interface ClassifyResult {
  label: Label;
  reason: string;
  signals: Signal[];
  rule_version: string;
}
