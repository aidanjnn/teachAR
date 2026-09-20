import * as THREE from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/GLTFLoader.js';
import {clone} from '/vendor/SkeletonUtils.js';
import {JOINTS} from './motion-core.mjs';
const assets=new Map();
const load=side=>{if(!assets.has(side))assets.set(side,new GLTFLoader().loadAsync(`/assets/hands/${side}.glb`));return assets.get(side);};
export class HolographicHand {
 constructor(parent,side='right',live=false){
  this.root=new THREE.Group();this.root.visible=false;parent.add(this.root);this.live=live;this.ready=false;this.error=null;
  this.loaded=load(side).then(gltf=>{
   const model=clone(gltf.scene);this.root.add(model);this.bones=JOINTS.map(name=>model.getObjectByName(name));
   if(this.bones.some(b=>!b))throw Error('Hand asset is missing a WebXR joint');
   this.material=new THREE.MeshBasicMaterial({color:0x7cdadd,transparent:true,opacity:live?.15:.42,depthWrite:false,depthTest:false,side:THREE.FrontSide});
   this.material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 trailNormal; varying vec3 trailView;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\ntrailNormal = normalize(transformedNormal);').replace('#include <project_vertex>','#include <project_vertex>\ntrailView = -mvPosition.xyz;');
    shader.fragmentShader='varying vec3 trailNormal; varying vec3 trailView;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float rim = pow(1.0 - abs(dot(normalize(trailNormal), normalize(trailView))), 2.0);
     outgoingLight *= 0.8 + 0.6 * rim;
     diffuseColor.a *= 0.55 + 1.1 * rim;
     #include <opaque_fragment>`);
   };
   model.traverse(o=>{if(o.isMesh){o.material=this.material;o.frustumCulled=false;}});this.ready=true;
  }).catch(e=>{this.error=e.message;this.root.visible=false;});
 }
 draw(joints,color){
  // Do not stretch skin over absent/invalid joints or leave a frozen believable hand.
  const valid=this.ready&&joints?.length===25&&joints.every(j=>j?.p?.length===3&&j.p.every(Number.isFinite)&&j?.q?.length===4&&j.q.every(Number.isFinite));
  this.root.visible=!!valid;if(!valid)return false;
  this.material.color.setHex(color);
  // The pinned asset uses flat sibling bones in the recorded workspace coordinates.
  this.bones.forEach((bone,i)=>{bone.position.fromArray(joints[i].p);bone.quaternion.fromArray(joints[i].q);});
  this.root.updateMatrixWorld(true);return true;
 }
}
