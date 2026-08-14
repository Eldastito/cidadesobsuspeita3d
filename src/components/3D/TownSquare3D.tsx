/**
 * Cidade Sob Suspeita 3D - Three.js WebGL Town Plaza
 * High performance, low-poly procedural 3D town square with dynamic day/night cycles
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GamePhase, PublicPlayerView } from '../../engine/types.ts';

interface TownSquare3DProps {
  players: PublicPlayerView[];
  localPlayerId: string;
  phase: GamePhase;
  selectedTargetId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

export const TownSquare3D: React.FC<TownSquare3DProps> = ({
  players,
  localPlayerId,
  phase,
  selectedTargetId,
  onSelectPlayer,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const playerMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const lightsRef = useRef<{
    ambient: THREE.AmbientLight;
    directional: THREE.DirectionalLight;
    point: THREE.PointLight;
  } | null>(null);

  const isNight = phase === GamePhase.NIGHT_ACTIONS || phase === GamePhase.NIGHT_RESOLUTION;
  const isDawn = phase === GamePhase.DAWN;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isNight ? 0x070b19 : 0x182032);
    scene.fog = new THREE.FogExp2(isNight ? 0x070b19 : 0x182032, 0.025);

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(isNight ? 0x223355 : 0xffffff, isNight ? 0.6 : 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(isNight ? 0x4466aa : 0xfffaed, isNight ? 0.8 : 1.6);
    dirLight.position.set(12, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const centerLantern = new THREE.PointLight(isNight ? 0xffaa44 : 0xffeebb, 2.0, 15);
    centerLantern.position.set(0, 3, 0);
    scene.add(centerLantern);

    lightsRef.current = { ambient: ambientLight, directional: dirLight, point: centerLantern };

    // 5. Environment & Plaza Construction
    // Cobblestone ground
    const groundGeo = new THREE.CylinderGeometry(14, 14.5, 0.6, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x272d3b,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.3;
    ground.receiveShadow = true;
    scene.add(ground);

    // Outer stone ring
    const ringGeo = new THREE.RingGeometry(13.8, 14.8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    // Center Plaza Monument / Fountain
    const fountainBaseGeo = new THREE.CylinderGeometry(2.4, 2.8, 0.7, 16);
    const fountainBaseMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.7 });
    const fountainBase = new THREE.Mesh(fountainBaseGeo, fountainBaseMat);
    fountainBase.position.y = 0.35;
    fountainBase.castShadow = true;
    fountainBase.receiveShadow = true;
    scene.add(fountainBase);

    const pillarGeo = new THREE.CylinderGeometry(0.5, 0.7, 2.5, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4c566a });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 1.6;
    pillar.castShadow = true;
    scene.add(pillar);

    // Center lantern orb
    const lanternGeo = new THREE.DodecahedronGeometry(0.5);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffbb55,
      emissive: 0xff8822,
      emissiveIntensity: 0.8,
    });
    const lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
    lanternMesh.position.set(0, 3, 0);
    scene.add(lanternMesh);

    // 6. Interactive Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const hit of intersects) {
        let cur: THREE.Object3D | null = hit.object;
        while (cur && cur !== scene) {
          if (cur.userData?.playerId) {
            onSelectPlayer(cur.userData.playerId);
            return;
          }
          cur = cur.parent;
        }
      }
    };

    renderer.domElement.addEventListener('click', handlePointerDown);

    // 7. Mouse Orbit Drag
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let cameraAngle = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      cameraAngle += deltaX * 0.005;
      prevMouseX = e.clientX;

      const radius = 18;
      camera.position.x = Math.sin(cameraAngle) * radius;
      camera.position.z = Math.cos(cameraAngle) * radius;
      camera.lookAt(0, 0.5, 0);
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // 8. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    // 9. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Gentle floating glow on center monument
      lanternMesh.position.y = 3.0 + Math.sin(elapsed * 2) * 0.1;
      centerLantern.intensity = (isNight ? 2.0 : 1.2) + Math.sin(elapsed * 3) * 0.3;

      // Animate player podium indicators
      playerMeshesRef.current.forEach((group, pId) => {
        const ring = group.getObjectByName('selectionRing');
        if (ring) {
          ring.rotation.z += 0.02;
        }
        const hand = group.getObjectByName('handMesh');
        if (hand) {
          hand.position.y = 2.4 + Math.sin(elapsed * 4) * 0.15;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', handlePointerDown);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
      if (container) container.innerHTML = '';
    };
  }, []);

  // Update Dynamic Lighting & Skybox on Phase Change
  useEffect(() => {
    if (!lightsRef.current || !sceneRef.current) return;
    const { ambient, directional, point } = lightsRef.current;

    if (isNight) {
      sceneRef.current.background = new THREE.Color(0x060a17);
      sceneRef.current.fog = new THREE.FogExp2(0x060a17, 0.03);
      ambient.color.setHex(0x1a2644);
      ambient.intensity = 0.5;
      directional.color.setHex(0x385288);
      directional.intensity = 0.7;
      point.color.setHex(0xff9933);
      point.intensity = 2.4;
    } else if (isDawn) {
      sceneRef.current.background = new THREE.Color(0x281822);
      sceneRef.current.fog = new THREE.FogExp2(0x281822, 0.025);
      ambient.color.setHex(0xffaa88);
      ambient.intensity = 0.7;
      directional.color.setHex(0xff8844);
      directional.intensity = 1.4;
      point.color.setHex(0xffcc66);
      point.intensity = 1.8;
    } else {
      sceneRef.current.background = new THREE.Color(0x182032);
      sceneRef.current.fog = new THREE.FogExp2(0x182032, 0.02);
      ambient.color.setHex(0xffffff);
      ambient.intensity = 0.85;
      directional.color.setHex(0xfffaed);
      directional.intensity = 1.5;
      point.color.setHex(0xffeebb);
      point.intensity = 1.2;
    }
  }, [phase, isNight, isDawn]);

  // Update Player 3D Avatars & Podiums
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old player meshes
    playerMeshesRef.current.forEach(mesh => scene.remove(mesh));
    playerMeshesRef.current.clear();

    const totalSeats = Math.max(players.length, 6);
    const radius = 9.0;

    players.forEach((player, index) => {
      const angle = (index / totalSeats) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      const playerGroup = new THREE.Group();
      playerGroup.position.set(x, 0, z);
      playerGroup.lookAt(0, 0, 0); // Face center monument
      playerGroup.userData = { playerId: player.id };

      const isSelected = selectedTargetId === player.id;
      const isLocal = localPlayerId === player.id;

      // 1. Seat Base Podium
      const podiumGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.4, 16);
      const podiumMat = new THREE.MeshStandardMaterial({
        color: !player.isAlive ? 0x1c1e24 : isSelected ? 0xef4444 : isLocal ? 0x3b82f6 : 0x333b4d,
        roughness: 0.6,
      });
      const podium = new THREE.Mesh(podiumGeo, podiumMat);
      podium.position.y = 0.2;
      podium.receiveShadow = true;
      playerGroup.add(podium);

      // 2. Glowing Ring when selected
      if (isSelected || isLocal) {
        const ringGeo = new THREE.TorusGeometry(1.3, 0.06, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0xff4444 : 0x60a5fa,
        });
        const selectRing = new THREE.Mesh(ringGeo, ringMat);
        selectRing.name = 'selectionRing';
        selectRing.rotation.x = Math.PI / 2;
        selectRing.position.y = 0.42;
        playerGroup.add(selectRing);
      }

      if (player.isAlive) {
        // 3. Body Torso
        const bodyGeo = new THREE.CapsuleGeometry(0.45, 0.7, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: isLocal ? 0x2563eb : 0x475569,
          roughness: 0.5,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.1;
        body.castShadow = true;
        playerGroup.add(body);

        // 4. Head
        const headGeo = new THREE.SphereGeometry(0.35, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({
          color: 0xf5d0b5,
          roughness: 0.6,
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.85;
        head.castShadow = true;
        playerGroup.add(head);

        // 5. Mayor Crown
        if (player.isMayor) {
          const crownGeo = new THREE.ConeGeometry(0.3, 0.35, 5);
          const crownMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 });
          const crown = new THREE.Mesh(crownGeo, crownMat);
          crown.position.y = 2.3;
          crown.rotation.x = Math.PI;
          playerGroup.add(crown);
        }

        // 6. Raised Hand Icon Mesh
        if (player.hasRaisedHand) {
          const handGeo = new THREE.BoxGeometry(0.25, 0.4, 0.1);
          const handMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
          const handMesh = new THREE.Mesh(handGeo, handMat);
          handMesh.name = 'handMesh';
          handMesh.position.y = 2.4;
          playerGroup.add(handMesh);
        }
      } else {
        // Tombstone for Dead Player
        const stoneGeo = new THREE.BoxGeometry(0.7, 1.1, 0.25);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 });
        const tombstone = new THREE.Mesh(stoneGeo, stoneMat);
        tombstone.position.y = 0.8;
        tombstone.castShadow = true;
        playerGroup.add(tombstone);
      }

      scene.add(playerGroup);
      playerMeshesRef.current.set(player.id, playerGroup);
    });
  }, [players, selectedTargetId, localPlayerId]);

  return (
    <div className="relative w-full h-full min-h-[380px] bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 shadow-inner">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      
      {/* Overlay Helper Badge */}
      <div className="absolute bottom-3 left-3 bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[11px] text-zinc-400 pointer-events-none flex items-center gap-2">
        <span>🖱️ Arraste para girar a praça</span>
        <span>•</span>
        <span>Clique em um cidadão para selecionar</span>
      </div>
    </div>
  );
};
