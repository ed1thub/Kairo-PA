/** @jsxImportSource chat */
import { Card, CardText, Actions, Button } from "chat";
import type { RiskLevel } from "@/lib/audit";

export function buildConfirmationCard(params: {
  pendingActionId: string;
  toolName: string;
  riskLevel: RiskLevel;
  summary: string;
}) {
  return (
    <Card title={`Confirm: ${params.toolName}`}>
      <CardText>{params.summary}</CardText>
      <CardText>Risk level: {params.riskLevel}</CardText>
      <Actions>
        <Button id="confirm_approve" value={params.pendingActionId} style="primary">
          Approve
        </Button>
        <Button id="confirm_reject" value={params.pendingActionId} style="danger">
          Reject
        </Button>
      </Actions>
    </Card>
  );
}
