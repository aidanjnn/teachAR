import type { Pose, Vec3 } from '@trail/contracts';
import { quat, vec3 } from 'gl-matrix';

/** Apply a rigid destinationFromSource transform. Inputs are validated poses. */
export function transformPose(pose: Pose, destinationFromSource: Pose): Pose {
  const position = vec3.transformQuat(vec3.create(), pose.positionM, destinationFromSource.orientationXyzw);
  vec3.add(position, position, destinationFromSource.positionM);
  const rotation = quat.multiply(quat.create(), destinationFromSource.orientationXyzw, pose.orientationXyzw);
  quat.normalize(rotation, rotation);
  return {
    positionM: [position[0], position[1], position[2]],
    orientationXyzw: [rotation[0], rotation[1], rotation[2], rotation[3]],
  };
}

export function invertTransform(transform: Pose): Pose {
  const rotation = quat.invert(quat.create(), transform.orientationXyzw);
  const negative: Vec3 = [-transform.positionM[0], -transform.positionM[1], -transform.positionM[2]];
  const position = vec3.transformQuat(vec3.create(), negative, rotation);
  return {
    positionM: [position[0], position[1], position[2]],
    orientationXyzw: [rotation[0], rotation[1], rotation[2], rotation[3]],
  };
}

export { proposeSteps, deriveStep, type ProposedStep } from './authoring.js';
export { createAuthoringFixture } from './synthetic.js';
