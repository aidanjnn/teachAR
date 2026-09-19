import * as THREE from 'three';
import { JOINT_NAMES, type MotionFrame, type Recording } from '@trail/contracts';

// Diagnostic joint chains, not an articulated hand mesh or grasp reconstruction.
const chains = [
  JOINT_NAMES.slice(1, 5), JOINT_NAMES.slice(5, 10), JOINT_NAMES.slice(10, 15),
  JOINT_NAMES.slice(15, 20), JOINT_NAMES.slice(20, 25),
];

export function createViewer(host: HTMLElement, recording: Recording) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#253b4b');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10);
  camera.position.set(0.58, 0.64, 0.8);
  camera.lookAt(0, 0.03, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', 'Synthetic hand motion above a 50 by 35 centimeter workspace mat');
  renderer.domElement.setAttribute('role', 'img');
  host.append(renderer.domElement);

  const workspace = new THREE.Group();
  scene.add(workspace);
  const { widthM, depthM, calibrationMarksM } = recording.workspace;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(widthM, depthM), new THREE.MeshBasicMaterial({ color: '#3e5668', side: THREE.DoubleSide }));
  mat.rotation.x = -Math.PI / 2;
  workspace.add(mat);
  const grid = new THREE.GridHelper(0.5, 10, '#738b9b', '#4c6678');
  grid.scale.z = depthM / widthM;
  grid.position.y = 0.0005;
  workspace.add(grid);
  for (const mark of Object.values(calibrationMarksM)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.009, 32), new THREE.MeshBasicMaterial({ color: '#d6e4ed', side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(mark[0], 0.001, mark[2]);
    workspace.add(ring);
  }

  // Separate paths at missing samples; never draw across a tracking gap.
  let segment: THREE.Vector3[] = [];
  function finishSegment() {
    if (segment.length > 1) {
      workspace.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(segment), new THREE.LineBasicMaterial({ color: '#79b6cd', transparent: true, opacity: 0.55 })));
    }
    segment = [];
  }
  for (const frame of recording.frames) {
    const hand = frame.hands.right;
    if (hand.status === 'missing') { finishSegment(); continue; }
    segment.push(new THREE.Vector3(...hand.joints.wrist.positionM));
  }
  finishSegment();

  const handGroup = new THREE.Group();
  workspace.add(handGroup);
  const jointGeometry = new THREE.SphereGeometry(0.0028, 10, 8);
  const jointMaterial = new THREE.MeshBasicMaterial({ color: '#9be5ef' });
  const joints = JOINT_NAMES.map(() => {
    const mesh = new THREE.Mesh(jointGeometry, jointMaterial);
    handGroup.add(mesh);
    return mesh;
  });
  const bonePositions = new Float32Array(24 * 2 * 3);
  const boneGeometry = new THREE.BufferGeometry();
  boneGeometry.setAttribute('position', new THREE.BufferAttribute(bonePositions, 3));
  const bones = new THREE.LineSegments(boneGeometry, new THREE.LineBasicMaterial({ color: '#9be5ef' }));
  bones.frustumCulled = false;
  handGroup.add(bones);

  function render() { renderer.render(scene, camera); }
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    render();
  });
  resize.observe(host);

  return {
    showFrame(frame: MotionFrame) {
      const hand = frame.hands.right;
      handGroup.visible = hand.status === 'valid';
      renderer.domElement.dataset.handVisible = String(handGroup.visible);
      if (hand.status === 'valid') {
        for (const [index, name] of JOINT_NAMES.entries()) {
          joints[index]?.position.fromArray(hand.joints[name].positionM);
        }
        let cursor = 0;
        for (const chain of chains) {
          let previous = hand.joints.wrist.positionM;
          for (const name of chain) {
            const next = hand.joints[name].positionM;
            bonePositions.set(previous, cursor); cursor += 3;
            bonePositions.set(next, cursor); cursor += 3;
            previous = next;
          }
        }
        boneGeometry.getAttribute('position').needsUpdate = true;
      }
      render();
    },
    dispose() {
      resize.disconnect();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
