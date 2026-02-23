import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const MeshWorkflowStepSchema = Type.Object(
  {
    id: NonEmptyString,
    name: Type.Optional(Type.String()),
    prompt: NonEmptyString,
    dependsOn: Type.Optional(Type.Array(Type.String())),
    agentId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const MeshWorkflowPlanSchema = Type.Object(
  {
    planId: NonEmptyString,
    goal: NonEmptyString,
    createdAt: Type.Integer({ minimum: 0 }),
    steps: Type.Array(MeshWorkflowStepSchema),
  },
  { additionalProperties: false },
);

export const MeshAutoStepSchema = Type.Object(
  {
    id: Type.Optional(Type.String()),
    name: Type.Optional(Type.String()),
    prompt: NonEmptyString,
    dependsOn: Type.Optional(Type.Array(Type.String())),
    agentId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

/** mesh.plan params */
export const MeshPlanParamsSchema = Type.Object(
  {
    goal: NonEmptyString,
    steps: Type.Optional(Type.Array(MeshAutoStepSchema)),
  },
  { additionalProperties: false },
);

/** mesh.plan.auto params */
export const MeshPlanAutoParamsSchema = Type.Object(
  {
    goal: NonEmptyString,
    maxSteps: Type.Optional(Type.Integer({ minimum: 1, maximum: 16 })),
    agentId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
    lane: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** mesh.run params */
export const MeshRunParamsSchema = Type.Object(
  {
    plan: MeshWorkflowPlanSchema,
    maxParallel: Type.Optional(Type.Integer({ minimum: 1, maximum: 16 })),
    defaultStepTimeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
    continueOnError: Type.Optional(Type.Boolean()),
    lane: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** mesh.status params */
export const MeshStatusParamsSchema = Type.Object(
  {
    runId: NonEmptyString,
  },
  { additionalProperties: false },
);

/** mesh.retry params */
export const MeshRetryParamsSchema = Type.Object(
  {
    runId: NonEmptyString,
    stepIds: Type.Optional(Type.Array(NonEmptyString)),
  },
  { additionalProperties: false },
);
