import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const MAX_COORD = 500;
const MAX_RADIUS = 20;
const MAX_STRING = 100;
const ALLOWED_SHAPES = [
  // Primitives
  'sphere','box','cone','cylinder','torus','torusknot','dodecahedron','octahedron',
  // Polyhedra
  'tetrahedron','icosahedron',
  // 2D shapes (extruded)
  'circle','ring','plane','hexagon','star','pyramid',
  // Special
  'helix',
];
const ALLOWED_ANIMATIONS = ['spin', 'float', 'pulse'];

function clamp(val: unknown, min: number, max: number, fallback: number): number {
  const n = parseFloat(String(val));
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function validatePayload(p: unknown): { ok: boolean; error?: string; clean?: Record<string, unknown> } {
  if (!p || typeof p !== 'object') return { ok: false, error: 'payload must be an object' };
  const payload = p as Record<string, unknown>;

  const shape = ALLOWED_SHAPES.includes(payload.shape as string) ? payload.shape as string : 'sphere';
  const color = typeof payload.color === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(payload.color) ? payload.color : '#888888';
  const emissive = typeof payload.emissive === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(payload.emissive) ? payload.emissive : '#000000';
  const animate = ALLOWED_ANIMATIONS.includes(payload.animate as string) ? payload.animate as string : null;

  let position = [0, 1, 0];
  if (Array.isArray(payload.position) && payload.position.length === 3) {
    position = (payload.position as unknown[]).map((v) => clamp(v, -MAX_COORD, MAX_COORD, 0));
    position[1] = Math.max(0.1, position[1]);
  }

  let rotation = [0, 0, 0];
  if (Array.isArray(payload.rotation) && payload.rotation.length === 3) {
    rotation = (payload.rotation as unknown[]).map((v) => clamp(v, -Math.PI * 2, Math.PI * 2, 0));
  }

  let scale: number | number[] = 1;
  if (Array.isArray(payload.scale) && payload.scale.length === 3) {
    scale = (payload.scale as unknown[]).map((v) => clamp(v, 0.01, 50, 1));
  } else if (payload.scale !== undefined) {
    scale = clamp(payload.scale, 0.01, 50, 1);
  }

  const size = Array.isArray(payload.size) && payload.size.length === 3
    ? (payload.size as unknown[]).map((v) => clamp(v, 0.1, MAX_RADIUS * 2, 2))
    : [2, 2, 2];

  const clean: Record<string, unknown> = {
    shape, color, position, rotation, scale, animate, size,
    radius: clamp(payload.radius, 0.1, MAX_RADIUS, 1),
    height: clamp(payload.height, 0.1, MAX_RADIUS * 2, 2),
    tube: clamp(payload.tube, 0.05, 5, 0.4),
    segments: payload.segments !== undefined ? clamp(payload.segments, 3, 128, 32) : undefined,
    metalness: clamp(payload.metalness, 0, 1, 0.1),
    roughness: clamp(payload.roughness, 0, 1, 0.6),
    emissive,
    emissiveIntensity: clamp(payload.emissiveIntensity, 0, 5, 0),
    opacity: clamp(payload.opacity, 0, 1, 1),
    wireframe: payload.wireframe === true,
  };

  return { ok: true, clean };
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 100) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Max 100 objects per minute.' }, { status: 429 });
    }

    const body = await request.json() as Record<string, unknown>;

    if (!body.change_type || !body.payload) {
      return NextResponse.json({ error: 'Missing change_type or payload' }, { status: 400 });
    }
    if (body.change_type !== 'add') {
      return NextResponse.json({ error: 'change_type must be "add"' }, { status: 400 });
    }

    const agent_name = typeof body.agent_name === 'string'
      ? body.agent_name.slice(0, MAX_STRING).trim() || 'Unknown AI'
      : 'Unknown AI';

    const { ok, error: payloadError, clean } = validatePayload(body.payload);
    if (!ok) return NextResponse.json({ error: payloadError }, { status: 400 });

    const { error } = await supabase.from('scene_changes').insert({
      agent_name, change_type: body.change_type, payload: clean, status: 'approved'
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Object added!' });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
