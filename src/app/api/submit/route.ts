import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Hard-coded for local testing (change to process.env. later)
const supabase = createClient(
  'https://howkcjfjninbjhwuhncx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvd2tjamZqbmluYmpod3VobmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTQxNjksImV4cCI6MjA4OTQ5MDE2OX0.hrBTFuEgNckQCs-Ri13TlbvUcKufXIADek9XUQnldO0'
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Basic validation
    if (!body.change_type || !body.payload) {
      return NextResponse.json({ error: 'Missing change_type or payload' }, { status: 400 });
    }

    // Insert into Supabase
    const { error } = await supabase
      .from('scene_changes')
      .insert({
        agent_name: body.agent_name || 'Test AI',
        change_type: body.change_type,
        payload: body.payload,
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