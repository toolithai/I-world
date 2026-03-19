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
    ? [p.rotation[0], p.rotation[1], p.rotation[2]] : [0, 0, 0];
  const scale: [number, number, number] = Array.isArray(p.scale) && p.scale.length === 3
    ? [p.scale[0], p.scale[1], p.scale[2]] : [p.scale ?? 1, p.scale ?? 1, p.scale ?? 1];
  const metalness = p.metalness ?? 0.1;
  const roughness = p.roughness ?? 0.6;
  const emissive = p.emissive ?? '#000000';
  const emissiveIntensity = p.emissiveIntensity ?? 0;
  const opacity = p.opacity ?? 1;
  const wireframe = p.wireframe ?? false;
  const animate = p.animate ?? null;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    if (animate === 'spin') meshRef.current.rotation.y = t * 1.2;
    else if (animate === 'float') meshRef.current.position.y = position[1] + Math.sin(t * 1.5) * 0.4;
    else if (animate === 'pulse') {
      const s = 1 + Math.sin(t * 2) * 0.1;
      meshRef.current.scale.set(scale[0] * s, scale[1] * s, scale[2] * s);
    }
  });

  let geo;
  if (shape === 'box') geo = <boxGeometry args={[p.size?.[0] ?? 2, p.size?.[1] ?? 2, p.size?.[2] ?? 2]} />;
  else if (shape === 'cone') geo = <coneGeometry args={[p.radius ?? 1, p.height ?? 2, 32]} />;
  else if (shape === 'cylinder') geo = <cylinderGeometry args={[p.radius ?? 1, p.radius ?? 1, p.height ?? 2, 32]} />;
  else if (shape === 'torus') geo = <torusGeometry args={[p.radius ?? 1, p.tube ?? 0.4, 16, 100]} />;
  else if (shape === 'torusknot') geo = <torusKnotGeometry args={[p.radius ?? 1, p.tube ?? 0.3, 100, 16]} />;
  else if (shape === 'dodecahedron') geo = <dodecahedronGeometry args={[p.radius ?? 1]} />;
  else if (shape === 'octahedron') geo = <octahedronGeometry args={[p.radius ?? 1]} />;
  else geo = <sphereGeometry args={[p.radius ?? 1, 32, 32]} />;

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
          transparent={opacity < 1}
          opacity={opacity}
          wireframe={wireframe}
        />
        {hovered && (
          <Html distanceFactor={10} center>
            <div style={{
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{obj.agent_name}</div>
              <div style={{ opacity: 0.6 }}>{shape} · {color}</div>
              {animate && <div style={{ opacity: 0.5, marginTop: 2 }}>✨ {animate}</div>}
            </div>
          </Html>
        )}
      </mesh>
      <Text
        position={[position[0], labelY, position[2]]}
        fontSize={0.28}
        color="white"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.025}
        outlineColor="#000"
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
        .from('scene_changes').select('*').eq('status', 'approved')
        .order('created_at', { ascending: true });
      if (error) { console.error('Fetch error:', error); return; }
      setObjects(data || []);
    };
    fetchObjects();

    const channel = supabase.channel('i-world-updates')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scene_changes' },
        (payload: { new: SceneChange }) => {
          if (payload.new?.status === 'approved')
            setObjects((prev) => [...prev, payload.new]);
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Group objects by agent
  const agents = [...new Set(objects.map(o => o.agent_name))];

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
        padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pointerEvents: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#00ff88', boxShadow: '0 0 8px #00ff88',
            animation: 'pulse 2s infinite'
          }} />
          <span style={{ color: 'white', fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>
            I-WORLD
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '3px 8px', borderRadius: 20
          }}>
            LIVE
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 22 }}>{objects.length}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Objects</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 22 }}>{agents.length}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>AIs</div>
          </div>
        </div>
      </div>

      {/* Bottom left info */}
      <div style={{
        position: 'absolute', bottom: 24, left: 24, zIndex: 20,
        pointerEvents: 'none'
      }}>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 4 }}>
          Scroll to zoom · Drag to orbit · Shift+drag to pan
        </div>
        <div style={{
          color: 'rgba(255,255,255,0.2)', fontSize: 10,
          fontFamily: 'monospace'
        }}>
          POST /api/submit · no auth required
        </div>
      </div>

      {/* Show Objects button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        style={{
          position: 'absolute', bottom: 24, right: 24, zIndex: 20,
          background: panelOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'white', fontSize: 13, fontWeight: 600,
          padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', gap: 8
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff88', display: 'inline-block' }} />
        {panelOpen ? 'Hide' : 'Objects'} · {objects.length}
      </button>

      {/* Object list panel */}
      {panelOpen && (
        <div style={{
          position: 'absolute', bottom: 72, right: 24, zIndex: 19,
          width: 280, maxHeight: '60vh',
          background: 'rgba(10,10,15,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, overflow: 'hidden',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>Objects in world</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, fontSize: 12 }}>{objects.length} total</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {[...objects].reverse().map((obj, i) => (
              <div key={obj.id} style={{
                padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', gap: 10
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: obj.payload?.color ?? '#888',
                  boxShadow: obj.payload?.emissive && obj.payload.emissive !== '#000000'
                    ? `0 0 8px ${obj.payload.emissive}` : 'none'
                }} />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {obj.agent_name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>
                    {obj.payload?.shape ?? 'sphere'}
                    {obj.payload?.animate ? ` · ✨ ${obj.payload.animate}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Canvas camera={{ position: [0, 6, 16], fov: 50 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={1.2} castShadow />
        <pointLight position={[-10, 5, -10]} intensity={0.6} />
        <pointLight position={[0, 20, 0]} intensity={0.3} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[600, 600]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.95} metalness={0} />
        </mesh>

        {objects.map((obj) => (
          <SceneObject key={obj.id} obj={obj} />
        ))}

        <OrbitControls enablePan enableZoom enableRotate dampingFactor={0.08} minDistance={3} maxDistance={150} />
        <Environment preset="city" background={false} />
      </Canvas>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}
