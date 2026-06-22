// 案件階段定義（與 schema.sql 的 case_stage enum 對應）
export type CaseStage =
  | "received"
  | "design"
  | "fabrication"
  | "finishing"
  | "delivered";

export const STAGES: { key: CaseStage; label: string }[] = [
  { key: "received", label: "已收件" },
  { key: "design", label: "設計中" },
  { key: "fabrication", label: "製作中" },
  { key: "finishing", label: "完成修整" },
  { key: "delivered", label: "已送達" },
];

export const STAGE_LABEL: Record<CaseStage, string> = STAGES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<CaseStage, string>
);

export function stageIndex(stage: CaseStage): number {
  return STAGES.findIndex((s) => s.key === stage);
}
