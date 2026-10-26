import * as THREE from './vendor/three/three.module.js';

const DEFAULT_COLOR = '#75e8ec';
const AMBER = '#ffc17a';
const FINISHES = new Set(['hologram', 'clay', 'chrome', 'glass']);

/** Build only local, procedural geometry. Scale/stretch belong to the owning scene. */
export function createArtMesh(part, { ghost = false, cameraMode = false } = {}) {
  const group = new THREE.Group();
  group.name = part.type + ' · ' + part.id;
  group.userData.partId = part.id;
  group.userData.type = part.type;
  group.userData.artType = part.type;
  group.userData.ghost = ghost;

  const add = (geometry, position = new THREE.Vector3(), wireGeometry = null) => {
    const body = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial());
    body.position.copy(position);
    body.userData.partId = part.id;
    body.userData.artBody = true;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const edgeGeometry = wireGeometry || new THREE.EdgesGeometry(geometry, 18);
    const edge = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
      transparent: true,
      opacity: .6,
      depthWrite: false,
    }));
    edge.position.copy(position);
    edge.userData.partId = part.id;
    edge.userData.edge = true;
    group.add(edge);
  };

  switch (part.type) {
    case 'core': {
      const wireSource = new THREE.SphereGeometry(.22, 12, 8);
      const wire = new THREE.WireframeGeometry(wireSource);
      wireSource.dispose();
      add(new THREE.SphereGeometry(.22, 40, 24), undefined, wire);
      break;
    }
    case 'ring':
      add(new THREE.TorusGeometry(.24, .065, 16, 56));
      break;
    case 'module':
      add(new THREE.BoxGeometry(.56, .32, .40));
      add(new THREE.BoxGeometry(.24, .16, .24), new THREE.Vector3(0, .22, 0));
      break;
    case 'crystal':
      add(new THREE.OctahedronGeometry(.30, 0));
      break;
    case 'column':
      add(new THREE.CylinderGeometry(.18, .18, .55, 40));
      break;
    case 'block':
      add(new THREE.BoxGeometry(.48, .40, .40));
      break;
    default:
      throw new Error('Unknown sculpture shape: ' + part.type);
  }

  updateArtMaterial(group, part, { cameraMode });
  return group;
}

function finishParameters(finish, cameraMode, ghost) {
  if (ghost) return {
    metalness: 0,
    roughness: .5,
    transparent: true,
    opacity: .10,
    depthWrite: false,
    transmission: 0,
    clearcoat: 0,
    iridescence: 0,
    emissiveIntensity: .25,
    side: THREE.DoubleSide,
  };
  const common = {
    side: THREE.FrontSide,
    emissiveIntensity: 0,
    transmission: 0,
    thickness: 0,
    ior: 1.45,
    iridescence: 0,
    clearcoat: 0,
    clearcoatRoughness: .2,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    envMapIntensity: 1,
  };
  if (finish === 'clay') return {
    ...common,
    metalness: 0,
    roughness: .82,
    clearcoat: .12,
  };
  if (finish === 'chrome') return {
    ...common,
    metalness: .94,
    roughness: .16,
    clearcoat: .7,
    clearcoatRoughness: .12,
    iridescence: .18,
    envMapIntensity: 1.7,
  };
  if (finish === 'glass') return {
    ...common,
    metalness: 0,
    roughness: .09,
    transmission: cameraMode ? 0 : .92,
    thickness: .35,
    clearcoat: 1,
    transparent: cameraMode,
    opacity: cameraMode ? .36 : 1,
    depthWrite: !cameraMode,
    iridescence: .32,
    envMapIntensity: 1.3,
  };
  return {
    ...common,
    side: THREE.DoubleSide,
    metalness: .25,
    roughness: .32,
    clearcoat: .25,
    transparent: true,
    opacity: cameraMode ? .18 : .24,
    depthWrite: false,
    emissiveIntensity: .35,
  };
}

/** Keep geometry and materials alive between frames; only shader changes recompile. */
export function updateArtMaterial(group, part, {
  selected = false,
  hovered = false,
  cameraMode = false,
} = {}) {
  const ghost = !!group.userData.ghost;
  const finish = FINISHES.has(part.finish) ? part.finish : 'hologram';
  const color = /^#[0-9a-f]{6}$/i.test(part.color || '') ? part.color : DEFAULT_COLOR;
  const materialKey = [finish, cameraMode, ghost].join('|');
  const appearanceKey = [materialKey, color, selected, hovered].join('|');
  if (appearanceKey === group.userData.appearanceKey) return;
  const needsShaderChange = materialKey !== group.userData.materialKey;

  group.traverse(object => {
    if (object.userData.artBody) {
      const material = object.material;
      if (needsShaderChange) {
        Object.assign(material, finishParameters(finish, cameraMode, ghost));
        material.needsUpdate = true;
      }
      // Selection lives on the outline, preserving the artist's chosen pigment.
      material.color.set(color);
      material.emissive.set((finish === 'hologram' || ghost) ? color : '#000000');
      object.castShadow = !ghost;
      object.receiveShadow = !ghost;
    } else if (object.userData.edge) {
      const emphasized = selected || hovered;
      object.visible = ghost || emphasized || finish === 'hologram';
      object.material.color.set(emphasized || ghost ? AMBER : color);
      object.material.opacity = ghost ? .55 : selected ? .96 : hovered ? .65 : .42;
      object.material.depthTest = !(ghost || emphasized);
    }
  });
  group.userData.materialKey = materialKey;
  group.userData.appearanceKey = appearanceKey;
  group.userData.finish = finish;
  group.userData.color = color;
}
