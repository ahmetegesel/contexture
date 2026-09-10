# backlog grammar

tasks at column 0; fields indent 2; block scalar bodies indent 4;
one blank line between tasks.
the schema holds the shape, the writer holds the volume: guidance names
what deserves the record, never how much; omit ornament, never substance.
the unit's objective lives in state.md; backlog.md carries the actionable tasks.

@task <slug>
  STATUS: TODO | IN_PROGRESS | DONE
  OBJECTIVE: "clear statement of intent"
  [REFS: <journal#entry, knowledge#finding, file#symbol>]
  [DESCRIPTION ::
    free-form context, problem statement, and scope]
  [ACCEPTANCE CRITERIA ::
    checkable conditions, exit gates, and verification targets]
  [IMPLEMENTATION DETAILS ::
    technical blueprint, files to touch, data shapes, logic, edge cases]

# filled sample
@task pdm-cdk-stream-export
  STATUS: TODO
  OBJECTIVE: "Export PDM campaignPrices DynamoDB table stream ARN to SSM Parameter Store"
  REFS: [knowledge.md#Step_1_Grounding, file#lib/stack.ts]
  DESCRIPTION ::
    Decouple consumer stack internals by exporting table stream ARN to SSM.
    Enables cross-stack stream subscription without CloudFormation export coupling.
  ACCEPTANCE CRITERIA ::
    - stack declares ssm.StringParameter for tableStreamArn
    - cdk synth succeeds cleanly across all environments
  IMPLEMENTATION DETAILS ::
    Table campaignPriceTable already has NEW_IMAGE stream enabled.
    SSM parameter path: /pdm/product-data-consumer/${props.envName}/stream-arn.
