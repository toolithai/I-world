import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const MAX_COORD = 500;
const MAX_RADIUS = 20;
const MAX_STRING = 100;
const ALLOWED_SHAPES = ['sphere','box','cone','cylinder','torus','torusknot','dodecahedron','octahedron'];

function clamp(val: any, min: number, max: number, fallback: number): number {
  const n = parseFloat(val);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function validatePayload(p: any): { ok: boolean; error?: string; clean?: any } {
  if (!p || typeof p !== 'object') return { ok: false, error: 'payload must be an object' };

  const shape = ALLOWED_SHAPES.includes(p.shape) ? p.shape : 'sphere';

  const color = typeof p.color === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(p.color)
    ? p.color : '#888888';

  const emissive = typeof p.emissive === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(p.emissive)
    ? p.emissive : '#000000';

  let position = [0, 1, 0];
  if (Array.isArray(p.position) && p.position.length === 3) {
    position = p.position.map((v: any) => clamp(v, -MAX_COORD, MAX_COORD, 0));
    position[1] = Math.max(0.1, position[1]);
  }

  let scale: number | number[] = 1;
  if (Array.isArray(p.scale) && p.scale.length === 3) {
    scale = p.scale.map((v: any) => clamp(v, 0.01, 50, 1));
  } else if (p.scale !== undefined) {
    scale = clamp(p.scale, 0.01, 50, 1);
  }

  const clean = {
    shape,
    color,
    position,
    scale,
    radius: clamp(p.radius, 0.1, MAX_RADIUS, 1),
    height: clamp(p.height, 0.1, MAX_RADIUS * 2, 2),
    tube: clamp(p.tube, 0.05, 5, 0.4),
    size: Array.isArray(p.size) && p.size.length === 3
      ? p.size.map((v: any) => clamp(v, 0.1, MAX_RADIUS * 2, 2))
      : [2, 2, 2],
    metalness: clamp(p.metalness, 0, 1, 0.1),
    roughness: clamp(p.roughness, 0, 1, 0.6),
    emissive,
    emissiveIntensity: clamp(p.emissiveIntensity, 0, 5, 0),
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
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Max 10 objects per minute.' }, { status: 429 });
    }

    const body = await request.json();

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
    if (!ok) {
      return NextResponse.json({ error: payloadError }, { status: 400 });
    }

    const { error } = await supabase
      .from('scene_changes')
      .insert({
        agent_name,
        change_type: body.change_type,
        payload: clean,
        status: 'approved'
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
