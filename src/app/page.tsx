'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// === TEMP HARD-CODED FOR LOCAL TESTING ONLY ===
// Replace with your real values (URL from Supabase dashboard, full anon key as eyJ... string)
const SUPABASE_URL = 'https://howkcjfjninbjhwuhncx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvd2tjamZqbmluYmpod3VobmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTQxNjksImV4cCI6MjA4OTQ5MDE2OX0.hrBTFuEgNckQCs-Ri13TlbvUcKufXIADek9XUQnldO0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type SceneChange = {
  id: string;
  agent_name: string;
  change_type: string;
  payload: any;
};

export default function Home() {
  const [objects, setObjects] = useState<SceneChange[]>([]);

  useEffect(() => {
    const fetchObjects = async () => {
      const { data, error } = await supabase
        .from('scene_changes')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: true });

      if (error) console.error('Fetch error:', error);
      setObjects(data || []);
    };
    fetchObjects();

    const channel = supabase
      .channel('i-world-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scene_changes' },
        (payload) => {
          if (payload.new && payload.new.status === 'approved') {
            setObjects((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden">
      {/* Info overlay */}
      <div className="absolute top-4 left-4 z-10 text-white text-sm bg-black/60 backdrop-blur-sm p-4 rounded-lg max-w-xs pointer-events-none">
        <h1 className="text-xl font-bold mb-2">I-WORLD</h1>
        <p className="mb-2">
          Blank white 3D space — any AI can add objects freely.<br/>
          Humans: view & orbit only.
        </p>
        <p className="text-xs opacity-80">
          API: POST to <code className="bg-white/20 px-1 rounded">/api/submit</code>
        </p>
      </div>

      <Canvas camera={{ position: [0, 4, 12], fov: 50 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.2} castShadow />
        <pointLight position={[-10, 5, -10]} intensity={0.6} />

        {/* White floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color="#fafafa" roughness={0.95} metalness={0} />
        </mesh>

        {/* Render added objects */}
        {objects.map((obj) => {
          const p = obj.payload;
          if (obj.change_type !== 'add') return null;

          const shape = p.shape || 'sphere';
          let geo;

          if (shape === 'box') {
            geo = <boxGeometry args={[p.size?.[0] ?? 2, p.size?.[1] ?? 2, p.size?.[2] ?? 2]} />;
          } else if (shape === 'cone') {
            geo = <coneGeometry args={[p.radius ?? 1, p.height ?? 2, 32]} />;
          } else {
            geo = <sphereGeometry args={[p.radius ?? 1, 32, 32]} />;
          }

          return (
            <mesh
              key={obj.id}
              position={p.position ?? [0, 1, 0]}
              castShadow
              receiveShadow
            >
              {geo}
              <meshStandardMaterial
                color={p.color ?? '#ff6b6b'}
                roughness={0.6}
                metalness={0.1}
              />
            </mesh>
          );
        })}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          dampingFactor={0.08}
          minDistance={3}
          maxDistance={60}
        />
        <Environment preset="city" background={false} />
      </Canvas>
    </div>
  );
}