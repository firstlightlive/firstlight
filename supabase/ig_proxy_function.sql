-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — Instagram API Proxy via Supabase
--
-- Browser CANNOT call graph.facebook.com (Safari blocks, CORS issues).
-- This creates a server-side proxy using Supabase database functions.
--
-- TWO approaches (try both — one will work):
-- Approach 1: pg_net extension (async HTTP from PostgreSQL)
-- Approach 2: http extension (sync HTTP from PostgreSQL)
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Try enabling extensions (one of these will be available)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ══════════════════════════════════════
-- Store IG API results in a table (pg_net is async, needs a callback table)
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ig_api_queue (
  id          BIGSERIAL PRIMARY KEY,
  request_id  TEXT UNIQUE,
  endpoint    TEXT NOT NULL,
  params      JSONB DEFAULT '{}',
  status      TEXT DEFAULT 'pending',  -- pending, processing, done, error
  response    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.ig_api_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY ig_queue_all ON public.ig_api_queue FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- Function: Queue an IG API call (async via pg_net)
-- Frontend calls this, then polls for result
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION ig_api_call(
  p_endpoint TEXT,
  p_params JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _url TEXT;
  _qs TEXT := '';
  _key TEXT;
  _val TEXT;
  _request_id TEXT;
  _net_id BIGINT;
BEGIN
  -- Build query string
  FOR _key, _val IN SELECT * FROM jsonb_each_text(p_params)
  LOOP
    IF _qs != '' THEN _qs := _qs || '&'; END IF;
    _qs := _qs || _key || '=' || _val;
  END LOOP;

  _url := 'https://graph.facebook.com/v21.0/' || p_endpoint;
  IF _qs != '' THEN _url := _url || '?' || _qs; END IF;

  _request_id := 'ig_' || extract(epoch from now())::text || '_' || (random()*1000)::int::text;

  -- Insert queue entry
  INSERT INTO public.ig_api_queue (request_id, endpoint, params, status)
  VALUES (_request_id, p_endpoint, p_params, 'processing');

  -- Make async HTTP call via pg_net
  SELECT net.http_post(
    url := _url,
    body := '{}'::jsonb
  ) INTO _net_id;

  -- Return the request ID for polling
  RETURN jsonb_build_object('request_id', _request_id, 'net_id', _net_id, 'status', 'processing', 'url', _url);

EXCEPTION WHEN OTHERS THEN
  -- If pg_net fails, return error with the URL so frontend can retry differently
  RETURN jsonb_build_object('error', SQLERRM, 'url', _url, 'request_id', _request_id);
END;
$$;

-- ══════════════════════════════════════
-- Simpler approach: Direct HTTP call (sync, if http extension available)
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION ig_api_direct(
  p_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _response RECORD;
  _result JSONB;
BEGIN
  -- Try using http extension for synchronous call
  SELECT status, content INTO _response FROM net.http_get(p_url);

  BEGIN
    _result := _response.content::JSONB;
  EXCEPTION WHEN OTHERS THEN
    _result := jsonb_build_object('raw', _response.content, 'http_status', _response.status);
  END;

  RETURN _result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION ig_api_call(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ig_api_direct(TEXT) TO anon, authenticated;

SELECT 'IG PROXY FUNCTIONS READY — run ig_api_call or ig_api_direct' AS status;
