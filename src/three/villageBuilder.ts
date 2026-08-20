/**
 * Cidade Sob Suspeita 3D — Construção procedural da vila
 * Praça circular cercada por casario low-poly, capela, fonte, postes,
 * árvores instanciadas e céu com estrelas/lua/nuvens.
 */

import * as THREE from 'three';
import { makeCobblestoneTexture, makeGrassTexture } from './sceneAssets.ts';

export interface VillageHandles {
  root: THREE.Group;
  /** Assentos dos bancos: posição + rotação (de frente para a fonte). */
  benchSeats: Array<{ x: number; z: number; ry: number }>;
  /** Posições dos postes (para as bandeirinhas do tema junino). */
  lampPositions: Array<{ x: number; z: number }>;
  /** Materiais de janelas — brilham à noite. */
  windowMaterials: THREE.MeshStandardMaterial[];
  /** Materiais das lanternas dos postes. */
  lanternMaterials: THREE.MeshStandardMaterial[];
  lanternLights: THREE.PointLight[];
  stars: THREE.Points;
  moon: THREE.Mesh;
  sunSprite: THREE.Mesh;
  clouds: THREE.Group[];
  fireflies: THREE.Points;
  fountainWater: THREE.Mesh;
  fountainOrb: THREE.Mesh;
  fountainLight: THREE.PointLight;
}

const HOUSE_PALETTE = [0xb9977a, 0xa8b090, 0xc4a58a, 0x9aa4b5, 0xbf8f70, 0xafa27f];
const ROOF_PALETTE = [0x8c4a3c, 0x6d4a38, 0x7c5544, 0x5c4a52];

export function buildVillage(quality: 'low' | 'high'): VillageHandles {
  const root = new THREE.Group();
  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const lanternMaterials: THREE.MeshStandardMaterial[] = [];
  const lanternLights: THREE.PointLight[] = [];
  const clouds: THREE.Group[] = [];

  // ── Chão ────────────────────────────────────────────────────────────────
  const grassTex = makeGrassTexture();
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(46, 40),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  grass.receiveShadow = quality === 'high';
  root.add(grass);

  const cobbleTex = makeCobblestoneTexture();
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(13.6, 14, 0.28, 40),
    new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.85 })
  );
  plaza.position.y = -0.14;
  plaza.receiveShadow = true;
  root.add(plaza);

  // Meio-fio da praça
  const curb = new THREE.Mesh(
    new THREE.TorusGeometry(13.8, 0.18, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x5b6270, roughness: 0.8 })
  );
  curb.rotation.x = Math.PI / 2;
  curb.position.y = 0.08;
  root.add(curb);

  // ── Fonte central ───────────────────────────────────────────────────────
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x757d8f, roughness: 0.75 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.8, 20), stoneMat);
  basin.position.y = 0.4;
  basin.castShadow = true;
  basin.receiveShadow = true;
  root.add(basin);

  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 0.12, 20),
    new THREE.MeshStandardMaterial({
      color: 0x3f7fae,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0.2,
    })
  );
  fountainWater.position.y = 0.74;
  root.add(fountainWater);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.4, 10), stoneMat);
  pillar.position.y = 1.7;
  pillar.castShadow = true;
  root.add(pillar);

  const fountainOrb = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.45),
    new THREE.MeshStandardMaterial({ color: 0xffc76b, emissive: 0xff9a2e, emissiveIntensity: 1 })
  );
  fountainOrb.position.y = 3.15;
  root.add(fountainOrb);

  const fountainLight = new THREE.PointLight(0xffb054, 1.6, 16, 1.6);
  fountainLight.position.set(0, 3.2, 0);
  root.add(fountainLight);

  // ── Casas ao redor ──────────────────────────────────────────────────────
  const houseCount = 9;
  for (let i = 0; i < houseCount; i++) {
    const angle = (i / houseCount) * Math.PI * 2 + 0.22;
    // A capela ocupa o "norte"
    if (Math.abs(angle - Math.PI) < 0.35) continue;
    const radius = 19 + (i % 3) * 2.2;
    const house = buildHouse(
      HOUSE_PALETTE[i % HOUSE_PALETTE.length],
      ROOF_PALETTE[i % ROOF_PALETTE.length],
      windowMaterials
    );
    house.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    house.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.2;
    house.scale.setScalar(0.9 + (i % 3) * 0.15);
    root.add(house);
  }

  // ── Capela com torre ────────────────────────────────────────────────────
  const chapel = buildChapel(windowMaterials);
  chapel.position.set(0, 0, -21);
  root.add(chapel);

  // ── Postes de luz ───────────────────────────────────────────────────────
  const lampCount = 6;
  const lampPositions: Array<{ x: number; z: number }> = [];
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 3.1, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c313d, roughness: 0.6, metalness: 0.4 });
  const lampGeo = new THREE.BoxGeometry(0.34, 0.42, 0.34);

  for (let i = 0; i < lampCount; i++) {
    const angle = (i / lampCount) * Math.PI * 2 + Math.PI / lampCount;
    const x = Math.sin(angle) * 11.6;
    const z = Math.cos(angle) * 11.6;
    lampPositions.push({ x, z });

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 1.55, z);
    pole.castShadow = true;
    root.add(pole);

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      emissive: 0xffa63e,
      emissiveIntensity: 0.2,
    });
    lanternMaterials.push(lampMat);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 3.2, z);
    root.add(lamp);

    // Apenas 2 luzes reais para não estourar o orçamento de luzes
    if (i % 3 === 0 && lanternLights.length < 2) {
      const light = new THREE.PointLight(0xffa63e, 0, 12, 1.8);
      light.position.set(x, 3.1, z);
      root.add(light);
      lanternLights.push(light);
    }
  }

  // ── Bancos (com assentos interativos) ───────────────────────────────────
  const benchSeats: Array<{ x: number; z: number; ry: number }> = [];
  const benchSeatGeo = new THREE.BoxGeometry(1.5, 0.1, 0.45);
  const benchLegGeo = new THREE.BoxGeometry(0.12, 0.4, 0.4);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4f34, roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(benchSeatGeo, woodMat);
    seat.position.y = 0.42;
    seat.castShadow = true;
    const leg1 = new THREE.Mesh(benchLegGeo, woodMat);
    leg1.position.set(-0.6, 0.2, 0);
    const leg2 = new THREE.Mesh(benchLegGeo, woodMat);
    leg2.position.set(0.6, 0.2, 0);
    bench.add(seat, leg1, leg2);
    const bx = Math.sin(angle) * 5.2;
    const bz = Math.cos(angle) * 5.2;
    bench.position.set(bx, 0, bz);
    bench.lookAt(0, 0, 0);
    root.add(bench);
    benchSeats.push({ x: bx, z: bz, ry: Math.atan2(-bx, -bz) });
  }

  // ── Árvores instanciadas ────────────────────────────────────────────────
  const treeCount = quality === 'high' ? 18 : 10;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
  const leafGeo = new THREE.IcosahedronGeometry(1.15, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3e6b40, roughness: 0.85, flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeCount);
  trunks.castShadow = quality === 'high';
  leaves.castShadow = quality === 'high';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + 0.45;
    const radius = 15.6 + (i % 4) * 4 + Math.random() * 3;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const scale = 0.85 + Math.random() * 0.7;

    dummy.position.set(x, 0.8 * scale, z);
    dummy.scale.setScalar(scale);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, (1.6 + 0.7) * scale, z);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  root.add(trunks, leaves);

  // ── Céu: estrelas, lua, sol, nuvens ─────────────────────────────────────
  const starCount = quality === 'high' ? 360 : 180;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // hemisfério
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.46;
    const r = 78;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi) + 4;
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.5, transparent: true, opacity: 0, depthWrite: false })
  );
  root.add(stars);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8edfa, transparent: true, opacity: 0 })
  );
  moon.position.set(-30, 38, -34);
  root.add(moon);

  const sunSprite = new THREE.Mesh(
    new THREE.SphereGeometry(3, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.9 })
  );
  sunSprite.position.set(34, 40, 22);
  root.add(sunSprite);

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    roughness: 1,
    flatShading: true,
  });
  const cloudBlobGeo = new THREE.IcosahedronGeometry(1.6, 0);
  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Group();
    const blobCount = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < blobCount; b++) {
      const blob = new THREE.Mesh(cloudBlobGeo, cloudMat);
      blob.position.set(b * 1.7 - blobCount * 0.8, Math.random() * 0.5, Math.random() * 1.2);
      blob.scale.setScalar(0.7 + Math.random() * 0.9);
      cloud.add(blob);
    }
    cloud.position.set((Math.random() - 0.5) * 70, 26 + Math.random() * 10, (Math.random() - 0.5) * 70);
    root.add(cloud);
    clouds.push(cloud);
  }

  // ── Vagalumes ───────────────────────────────────────────────────────────
  const fireflyCount = quality === 'high' ? 42 : 20;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  for (let i = 0; i < fireflyCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 4 + Math.random() * 9;
    fireflyPositions[i * 3] = Math.sin(angle) * radius;
    fireflyPositions[i * 3 + 1] = 0.6 + Math.random() * 2.2;
    fireflyPositions[i * 3 + 2] = Math.cos(angle) * radius;
  }
  const fireflyGeo = new THREE.BufferGeometry();
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
  const fireflies = new THREE.Points(
    fireflyGeo,
    new THREE.PointsMaterial({ color: 0xc8ff7a, size: 0.16, transparent: true, opacity: 0, depthWrite: false })
  );
  root.add(fireflies);

  return {
    root,
    benchSeats,
    lampPositions,
    windowMaterials,
    lanternMaterials,
    lanternLights,
    stars,
    moon,
    sunSprite,
    clouds,
    fireflies,
    fountainWater,
    fountainOrb,
    fountainLight,
  };
}

function buildHouse(
  wallColor: number,
  roofColor: number,
  windowMaterials: THREE.MeshStandardMaterial[]
): THREE.Group {
  const house = new THREE.Group();

  const w = 3.4 + Math.random() * 1.4;
  const h = 2.4 + Math.random() * 0.8;
  const d = 3 + Math.random() * 1;

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 })
  );
  walls.position.y = h / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  // Telhado prisma (cone de 4 lados achatado)
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.5, 4),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8, flatShading: true })
  );
  roof.position.y = h + 0.74;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  // Porta
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.3, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x54382a, roughness: 0.8 })
  );
  door.position.set(0, 0.65, d / 2 + 0.04);
  house.add(door);

  // Janelas com brilho noturno (material individual por casa)
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x2b3244,
    emissive: 0xffb95e,
    emissiveIntensity: 0.05,
    roughness: 0.4,
  });
  windowMaterials.push(windowMat);
  const windowGeo = new THREE.BoxGeometry(0.5, 0.5, 0.08);
  const win1 = new THREE.Mesh(windowGeo, windowMat);
  win1.position.set(-w / 4, h * 0.6, d / 2 + 0.04);
  const win2 = new THREE.Mesh(windowGeo, windowMat);
  win2.position.set(w / 4, h * 0.6, d / 2 + 0.04);
  house.add(win1, win2);

  // Chaminé em algumas casas
  if (Math.random() < 0.5) {
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 1, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x77584a, roughness: 0.9 })
    );
    chimney.position.set(w / 4, h + 1, -d / 6);
    house.add(chimney);
  }

  return house;
}

function buildChapel(windowMaterials: THREE.MeshStandardMaterial[]): THREE.Group {
  const chapel = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c4a52, roughness: 0.8, flatShading: true });

  const nave = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 7), wallMat);
  nave.position.y = 1.7;
  nave.castShadow = true;
  chapel.add(nave);

  const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2, 4), roofMat);
  naveRoof.position.y = 4.4;
  naveRoof.rotation.y = Math.PI / 4;
  naveRoof.scale.z = 1.5;
  naveRoof.castShadow = true;
  chapel.add(naveRoof);

  // Torre do sino
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.4, 1.8), wallMat);
  tower.position.set(0, 3.2, 4);
  tower.castShadow = true;
  chapel.add(tower);

  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.8, 4), roofMat);
  towerRoof.position.set(0, 7.3, 4);
  towerRoof.rotation.y = Math.PI / 4;
  chapel.add(towerRoof);

  // Rosácea que brilha à noite
  const roseMat = new THREE.MeshStandardMaterial({
    color: 0x3a2f4a,
    emissive: 0xc79aff,
    emissiveIntensity: 0.05,
    roughness: 0.4,
  });
  windowMaterials.push(roseMat);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12), roseMat);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(0, 4.6, 4.95);
  chapel.add(rose);

  // Cruz no topo
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xd8c891, metalness: 0.5, roughness: 0.4 });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), crossMat);
  crossV.position.set(0, 8.5, 4);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), crossMat);
  crossH.position.set(0, 8.6, 4);
  chapel.add(crossV, crossH);

  return chapel;
}
