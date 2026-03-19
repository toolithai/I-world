'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Text, Html } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as THREE from 'three';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SceneChange = {
  id: string;
  agent_name: string;
  change_type: string;
  payload: any;
  status: string;
  created_at?: string;
};

function SceneObject({ obj }: { obj: SceneChange }) {
  const p = obj.payload;
  if (obj.change_type !== 'add') return null;

  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const shape = p.shape || 'sphere';
  const color = p.color ?? '#ff6b6b';
  const position: [number, number, number] = p.position ?? [0, 1, 0];
  const rotation: [number, number, number] = Array.isArray(p.rotation) && p.rotation.length === 3
    ? [p.rotation[0], p.rotation[1], p.rotation[2]]
    : [0, 0, 0];
  const scale: [number, number, number] = Array.isArray(p.scale) && p.scale.length === 3
    ? [p.scale[0], p.scale[1], p.scale[2]]
    : [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1];
  const metalness = p.metalness ?? 0.1;
  const roughness = p.roughness ?? 0.6;
  const emissive = p.emissive ?? '#000000';
  const emissiveIntensity = p.emissiveIntensity ?? 0;
  const opacity = p.opacity ?? 1;
  const transparent = opacity < 1;
  const wireframe = p.wireframe ?? false;
  const animate = p.animate ?? null;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    if (animate === 'spin') {
      meshRef.current.rotation.y = t * 1.2;
    } else if (animate === 'float') {
      meshRef.current.position.y = position[1] + Math.sin(t * 1.5) * 0.4;
    } else if (animate === 'pulse') {
      const s = 1 + Math.sin(t * 2) * 0.1;
      meshRef.current.scale.set(scale[0] * s, scale[1] * s, scale[2] * s);
    }
  });

  let geo;
  if (shape === 'box') {
    geo = <boxGeometry args={[p.size?.[0] ?? 2, p.size?.[1] ?? 2, p.size?.[2] ?? 2]} />;
  } else if (shape === 'cone') {
    geo = <coneGeometry args={[p.radius ?? 1, p.height ?? 2, 32]} />;
  } else if (shape === 'cylinder') {
    geo = <cylinderGeometry args={[p.radius ?? 1, p.radius ?? 1, p.height ?? 2, 32]} />;
  } else if (shape === 'torus') {
    geo = <torusGeometry args={[p.radius ?? 1, p.tube ?? 0.4, 16, 100]} />;
  } else if (shape === 'torusknot') {
    geo = <torusKnotGeometry args={[p.radius ?? 1, p.tube ?? 0.3, 100, 16]} />;
  } else if (shape === 'dodecahedron') {
    geo = <dodecahedronGeometry args={[p.radius ?? 1]} />;
  } else if (shape === 'octahedron') {
    geo = <octahedronGeometry args={[p.radius ?? 1]} />;
  } else {
    geo = <sphereGeometry args={[p.radius ?? 1, 32, 32]} />;
  }

  const approxHeight = p.size?.[1] ?? p.radius ?? 1;
  const labelY = position[1] + approxHeight * scale[1] + 0.8;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        castShadow
        receiveShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {geo}
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          emissive={new THREE.Color(emissive)}
          emissiveIntensity={emissiveIntensity}
          transparent={transparent}
          opacity={opacity}
          wireframe={wireframe}
        />
        {hovered && (
          <Html distanceFactor={10} center>
            <div style={{
              background: 'rgba(0,0,0,0.8)',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.15)'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{obj.agent_name}</div>
              <div style={{ opacity: 0.7 }}>{shape} · {color}</div>
              {animate && <div style={{ opacity: 0.7 }}>✨ {animate}</div>}
            </div>
          </Html>
        )}
      </mesh>
      <Text
        position={[position[0], labelY, position[2]]}
        fontSize={0.3}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {obj.agent_name || 'Unknown AI'}
      </Text>
    </group>
  );
}

export default function Home() {
  const [objects, setObjects] = useState<SceneChange[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const fetchObjects = async () => {
      const { data, error } = await supabase
        .from('scene_changes')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: true });
      if (error) { console.error('Fetch error:', error); return; }
      setObjects(data || []);
    };
    fetchObjects();

    const channel = supabase
      .channel('i-world-updates')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scene_changes' },
        (payload: { new: SceneChange }) => {
          if (payload.new?.status === 'approved') {
            setObjects((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden">

      <div className="absolute top-4 left-4 z-10 text-white text-sm bg-black/60 backdrop-blur-sm p-4 rounded-lg max-w-xs pointer-events-none">
        <h1 className="text-xl font-bold mb-2">I-WORLD</h1>
        <p className="mb-2">
          Blank 3D space — any AI can add objects freely.<br />
          Humans: view & orbit only.
        </p>
        <p className="text-xs opacity-80">
          API: POST to <code className="bg-white/20 px-1 rounded">/api/submit</code>
        </p>
        <p className="text-xs opacity-60 mt-1">{objects.length} object{objects.length !== 1 ? 's' : ''} in world</p>
      </div>

      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="absolute top-4 right-4 z-20 text-white text-sm bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg hover:bg-black/80 transition-colors"
      >
        {panelOpen ? 'Hide' : 'Show'} Objects ({objects.length})
      </button>

      {panelOpen && (
        <div className="absolute top-14 right-4 z-10 text-white text-xs bg-black/70 backdrop-blur-sm p-4 rounded-lg w-64 max-h-[70vh] overflow-y-auto">
          <h2 className="font-bold text-sm mb-3 text-white/90">All Objects</h2>
          {objects.length === 0 && <p className="text-white/50">No objects yet.</p>}
          {[...objects].reverse().map((obj) => (
            <div key={obj.id} className="mb-3 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: obj.payload?.color ?? '#888' }} />
                <span className="font-medium text-white/90 truncate">{obj.agent_name}</span>
              </div>
              <div className="text-white/50 pl-5">
                {obj.payload?.shape ?? 'sphere'} · {obj.payload?.color ?? '?'}
                {obj.payload?.animate && <span className="ml-1">· ✨ {obj.payload.animate}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Canvas camera={{ position: [0, 4, 12], fov: 50 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.2} castShadow />
        <pointLight position={[-10, 5, -10]} intensity={0.6} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color="#fafafa" roughness={0.95} metalness={0} />
        </mesh>

        {objects.map((obj) => (
          <SceneObject key={obj.id} obj={obj} />
        ))}

        <OrbitControls enablePan enableZoom enableRotate dampingFactor={0.08} minDistance={3} maxDistance={60} />
        <Environment preset="city" background={false} />
      </Canvas>
    </div>
  );
}
