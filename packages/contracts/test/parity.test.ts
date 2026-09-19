import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as contracts from '../src/index.js';
import corpus from '../../../fixtures/contracts/corpus.json';
import golden from '../../../fixtures/contracts/transforms.json';
import map from '../../../fixtures/contracts/joint-map.json';
import { invertTransform, transformPose } from '../../motion/src/index.js';
function patched(test: (typeof corpus.cases)[number]): string {
  if ('json' in test) return test.json!;
  const value = JSON.parse(readFileSync(`fixtures/contracts/${test.file}`, 'utf8')) as Record<string, unknown>;
  if ('patches' in test) for (const patch of test.patches!) {
    let parent: any = value;
    for (const part of patch.path.slice(0,-1)) parent = parent[part];
    const last = patch.path.at(-1)!;
    if ('remove' in patch && patch.remove) delete parent[last]; else parent[last] = 'value' in patch ? patch.value : undefined;
  }
  return JSON.stringify(value);
}
describe('shared strict contract corpus', () => {
  it.each(corpus.cases)('$name', test => {
    const schema = (contracts as Record<string,unknown>)[`${test.contract}Schema`] as z.ZodType;
    if (test.valid) expect(() => contracts.parseContractJson(schema,patched(test))).not.toThrow();
    else expect(() => contracts.parseContractJson(schema,patched(test))).toThrow();
  });
  it('binds tutorial targets to valid recording poses and identities', () => {
    const recording=contracts.RecordingSchema.parse(JSON.parse(readFileSync('fixtures/contracts/recording.json','utf8')));
    const tutorial=contracts.TutorialSchema.parse(JSON.parse(readFileSync('fixtures/contracts/tutorial.json','utf8')));
    expect(contracts.parseTutorialForRecording(tutorial,recording,tutorial.recordingHash)).toEqual(tutorial);
    for (const change of [(t:contracts.Tutorial)=>{t.recordingId='wrong';},(t:contracts.Tutorial)=>{t.workspace.layoutId='wrong';},(t:contracts.Tutorial)=>{t.steps[0]!.targets[0]!.checkpointPose.positionM[0]+=0.02;}]) {
      const invalid=structuredClone(tutorial); change(invalid); expect(()=>contracts.parseTutorialForRecording(invalid,recording,tutorial.recordingHash)).toThrow();
    }
  });
  it('preserves the explicit named OpenXR map and excludes palm',()=>{
    expect(contracts.OPENXR_JOINT_MAP).toEqual(map.canonicalToNative);
    expect(Object.keys(map.canonicalToNative)).toEqual([...contracts.JOINT_NAMES]);
    expect(new Set(Object.values(map.canonicalToNative)).size).toBe(25);
    expect(Object.values(map.canonicalToNative)).not.toContain(map.excludedNativeJoint);
  });
  it.each(golden.cases)('golden transform $name', fixture=>{
    const p=contracts.PoseSchema.parse(fixture.pose), t=contracts.PoseSchema.parse(fixture.referenceFromWorkspace);
    const actual=transformPose(p,t);
    actual.positionM.forEach((v,i)=>expect(v).toBeCloseTo(fixture.expected.positionM[i]!,6));
    actual.orientationXyzw.forEach((v,i)=>expect(v).toBeCloseTo(fixture.expected.orientationXyzw[i]!,6));
    transformPose(actual,invertTransform(t)).positionM.forEach((v,i)=>expect(v).toBeCloseTo(p.positionM[i]!,6));
  });
});
